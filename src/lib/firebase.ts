'use client';
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getDatabase, type Database } from 'firebase/database';
import { isDiscordActivity } from './discord';

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

function resolveDbUrl(): string | undefined {
  if (!config.databaseURL) return undefined;
  if (typeof window !== 'undefined' && isDiscordActivity()) {
    return `${window.location.origin}/firebase`;
  }
  return config.databaseURL;
}

export const hasFirebaseClient = Boolean(config.databaseURL || (config.apiKey && config.projectId));

let app: FirebaseApp | null = null;
let db: Database | null = null;

export function getFirebaseClientDb(): Database | null {
  if (typeof window === 'undefined') return null;
  if (!hasFirebaseClient) return null;
  if (db) return db;

  try {
    app = getApps().length > 0 ? getApp() : initializeApp(config);
    db = getDatabase(app, resolveDbUrl());
    return db;
  } catch (err) {
    console.error('[FirebaseClient] Initialization failed:', err);
    return null;
  }
}

