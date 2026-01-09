// Client-side monitoring utilities for tracking performance and errors

export interface PerformanceMetric {
  endpoint: string;
  duration: number;
  status: number;
  timestamp: number;
  error?: string;
}

export interface ErrorMetric {
  message: string;
  stack?: string;
  context?: string;
  timestamp: number;
}

class MonitoringService {
  private metrics: PerformanceMetric[] = [];
  private errors: ErrorMetric[] = [];
  private maxMetrics = 100; // Keep last 100 metrics
  private maxErrors = 50; // Keep last 50 errors

  // Track API call performance
  trackApiCall(endpoint: string, duration: number, status: number, error?: string) {
    const metric: PerformanceMetric = {
      endpoint,
      duration,
      status,
      timestamp: Date.now(),
      error,
    };

    this.metrics.push(metric);
    if (this.metrics.length > this.maxMetrics) {
      this.metrics.shift();
    }

    // Log slow requests (>2 seconds)
    if (duration > 2000) {
      console.warn(`⚠️ Slow API call: ${endpoint} took ${duration}ms`);
    }

    // Log failed requests
    if (status >= 400) {
      console.error(`❌ API error: ${endpoint} returned ${status}${error ? `: ${error}` : ''}`);
    }

    // Log to localStorage for debugging
    this.saveToLocalStorage();
  }

  // Track errors
  trackError(message: string, context?: string, stack?: string) {
    const error: ErrorMetric = {
      message,
      stack,
      context,
      timestamp: Date.now(),
    };

    this.errors.push(error);
    if (this.errors.length > this.maxErrors) {
      this.errors.shift();
    }

    console.error(`❌ Error tracked: ${message}`, { context, stack });
    this.saveToLocalStorage();
  }

  // Get performance statistics
  getStats() {
    if (this.metrics.length === 0) {
      return null;
    }

    const durations = this.metrics.map(m => m.duration);
    const errorCount = this.metrics.filter(m => m.status >= 400).length;
    const slowCount = this.metrics.filter(m => m.duration > 2000).length;

    return {
      totalCalls: this.metrics.length,
      averageResponseTime: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
      minResponseTime: Math.min(...durations),
      maxResponseTime: Math.max(...durations),
      errorCount,
      errorRate: ((errorCount / this.metrics.length) * 100).toFixed(1),
      slowCount,
      slowRate: ((slowCount / this.metrics.length) * 100).toFixed(1),
      recentErrors: this.errors.slice(-5),
      recentMetrics: this.metrics.slice(-10),
    };
  }

  // Get endpoint-specific stats
  getEndpointStats(endpoint: string) {
    const endpointMetrics = this.metrics.filter(m => m.endpoint.includes(endpoint));
    if (endpointMetrics.length === 0) return null;

    const durations = endpointMetrics.map(m => m.duration);
    const errorCount = endpointMetrics.filter(m => m.status >= 400).length;

    return {
      endpoint,
      calls: endpointMetrics.length,
      avgDuration: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
      errorCount,
      errorRate: ((errorCount / endpointMetrics.length) * 100).toFixed(1),
    };
  }

  // Save to localStorage for persistence
  private saveToLocalStorage() {
    try {
      localStorage.setItem('monitoring_metrics', JSON.stringify(this.metrics.slice(-20)));
      localStorage.setItem('monitoring_errors', JSON.stringify(this.errors.slice(-10)));
    } catch (err) {
      // Ignore localStorage errors
    }
  }

  // Load from localStorage
  loadFromLocalStorage() {
    try {
      const metricsData = localStorage.getItem('monitoring_metrics');
      const errorsData = localStorage.getItem('monitoring_errors');

      if (metricsData) {
        this.metrics = JSON.parse(metricsData);
      }
      if (errorsData) {
        this.errors = JSON.parse(errorsData);
      }
    } catch (err) {
      // Ignore localStorage errors
    }
  }

  // Clear all data
  clear() {
    this.metrics = [];
    this.errors = [];
    try {
      localStorage.removeItem('monitoring_metrics');
      localStorage.removeItem('monitoring_errors');
    } catch (err) {
      // Ignore
    }
  }

  // Export data for analysis
  exportData() {
    return {
      metrics: this.metrics,
      errors: this.errors,
      stats: this.getStats(),
      timestamp: new Date().toISOString(),
    };
  }
}

// Singleton instance
export const monitoring = new MonitoringService();

// Load persisted data on initialization
if (typeof window !== 'undefined') {
  monitoring.loadFromLocalStorage();
}

// Wrapper for fetch that tracks performance
export async function monitoredFetch(
  url: string,
  options?: RequestInit
): Promise<Response> {
  const startTime = performance.now();

  try {
    const response = await fetch(url, options);
    const duration = Math.round(performance.now() - startTime);

    monitoring.trackApiCall(url, duration, response.status);

    return response;
  } catch (error) {
    const duration = Math.round(performance.now() - startTime);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    monitoring.trackApiCall(url, duration, 0, errorMessage);
    monitoring.trackError(`Fetch failed: ${url}`, errorMessage);

    throw error;
  }
}
