# Discord Activity Integration Guide

This guide explains how to set up, configure, test, and deploy **Ú Nồ Card Game** as a **Discord Voice Channel Activity**.

---

## 1. Overview

Discord Activities are web applications embedded directly inside Discord voice channels via an iframe using the **Discord Embedded App SDK**.

Key characteristics of Ú Nồ's Discord integration:
- **Zero build divergence**: The exact same build runs in a normal browser tab and inside Discord.
- **Runtime detection**: The client automatically detects the Discord environment via URL parameters (`frame_id`, `instance_id`) and iframe context.
- **Shared Room Sync**: The voice channel's `instance_id` is automatically used to derive the default room code, ensuring everyone who clicks "Play" in the voice channel joins the exact same room.
- **Discord Identity**: Player display names and avatars are fetched seamlessly via Discord's OAuth2 flow.

---

## 2. Discord Developer Portal Setup

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications).
2. Click **New Application** and enter a name (e.g., `Ú Nồ 3D`).
3. Note your **Client ID** and generate a **Client Secret** in the **OAuth2** tab.
4. Under **Activities**:
   - Enable **Activities**.
   - Configure **Supported Platforms**: Desktop, iOS, Android, Web.
   - Set **Max Participants**: 4 (or more for spectators).
5. In **URL Mappings** (under Activities / Getting Started):
   - Map your public domain to the root path:
     - Target: `https://your-public-domain.com`
     - Prefix: `/`

---

## 3. Environment Variables Configuration

Create or update your `.env` file in the monorepo root:

```ini
# Public domain where your application is hosted
APP_URL="https://your-domain.com"
NEXT_PUBLIC_SITE_URL="https://your-domain.com"

# Discord Developer Credentials
NEXT_PUBLIC_DISCORD_CLIENT_ID="123456789012345678"
DISCORD_CLIENT_SECRET="your_discord_client_secret_here"

# Internal Ports
PORT=3000
SERVER_PORT=3001
CLIENT_PORT=3002
INTERNAL_SERVER_URL="http://localhost:3001"
```

---

## 4. Local Testing with Tunneling

Discord requires an HTTPS URL with valid certificates to run an Activity in an iframe. For local development:

### Using Cloudflare Tunnel
```bash
# Expose the local gateway (port 3000)
cloudflared tunnel --url http://localhost:3000
```

### Using ngrok
```bash
ngrok http 3000
```

Copy the generated HTTPS URL (e.g., `https://xyz.trycloudflare.com`) and paste it into the **URL Mappings** section of your Discord Application.

---

## 5. How Authentication Works

1. When launched inside Discord, `@discord/embedded-app-sdk` initializes.
2. The SDK requests an authorization code with scope `identify`.
3. The client sends this code to the Next.js API route `/api/discord/token`.
4. The server exchanges the code with Discord's OAuth2 token endpoint using `DISCORD_CLIENT_SECRET`.
5. User profile information (username, avatar URL) is returned to the client and propagated to the room via Socket.IO.
