#!/bin/bash
# Helper script to create .env file

if [ ! -f .env ]; then
  cat > .env << 'EOF'
# Database connection (PostgreSQL required)
# For local Postgres: postgresql://user:password@localhost:5432/calcutta
# For Supabase: Get connection string from Project Settings > Database
DATABASE_URL=postgresql://user:password@localhost:5432/calcutta?sslmode=prefer

# WebSocket server port
NEXT_PUBLIC_WS_PORT=4000

# Demo event seeding (optional)
SEED_DEMO_EVENT=true
DEMO_RNG_SEED=calcutta-demo-seed
EOF
  echo "✅ Created .env file. Please update DATABASE_URL with your actual database connection string."
else
  echo "⚠️  .env file already exists. Skipping creation."
fi

