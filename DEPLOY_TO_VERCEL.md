# Deploy to Vercel - Quick Guide

## ✅ What's Done

Your app is now configured to work on **Vercel's free tier** using Server-Sent Events (SSE) instead of WebSocket. The code automatically:
- Uses **SSE** on Vercel (free tier compatible)
- Uses **WebSocket** locally if `NEXT_PUBLIC_WS_PORT` is set (for development)

## 🚀 Deployment Steps

### 1. Push to GitHub
```bash
git add .
git commit -m "Add SSE support for Vercel deployment"
git push
```

### 2. Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in
2. Click **"Add New Project"**
3. Import your GitHub repository
4. Vercel will auto-detect Next.js

### 3. Set Environment Variables

In Vercel Dashboard → Your Project → Settings → Environment Variables:

```
DATABASE_URL=postgresql://... (your Supabase connection string)
```

**Important**: Do NOT set `NEXT_PUBLIC_WS_PORT` - leave it unset so SSE is used.

### 4. Deploy

Click **"Deploy"** and wait ~2-3 minutes.

### 5. Test

Once deployed, you'll get a URL like: `https://your-project.vercel.app`

Test:
- ✅ Create an event
- ✅ Open a team
- ✅ Place bids (should update in real-time)
- ✅ Timer countdown
- ✅ CSV export

## 🎉 That's It!

Your app is now live and shareable! Anyone with the link can:
- View the auction (`/audience/[eventId]`)
- Place bids in real-time
- See updates instantly

## 💰 Cost

- **Vercel**: Free (Hobby plan)
- **Supabase Database**: Free tier (up to 500MB)
- **Total**: $0/month

## 🔧 Local Development

To use WebSocket locally (optional):
1. Set `NEXT_PUBLIC_WS_PORT=4000` in your `.env.local`
2. The WebSocket server will start automatically
3. Otherwise, it uses SSE (which also works locally)

## 📝 Notes

- SSE works great for low-use personal projects
- Real-time updates work perfectly
- No external services needed
- Works on Vercel free tier

## 🐛 Troubleshooting

**Real-time updates not working?**
- Check browser console for errors
- Verify `DATABASE_URL` is set correctly
- Make sure you're not setting `NEXT_PUBLIC_WS_PORT` in Vercel

**Build fails?**
- Check that Prisma client generates (`prisma generate` runs automatically)
- Verify all environment variables are set


