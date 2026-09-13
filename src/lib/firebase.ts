'use client';
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import {
  getDatabase,
  forceWebSockets,
  type Database,
} from 'firebase/database';
import { setupDiscordUrlMappings } from './discord';

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const hasFirebaseClient = Boolean(config.databaseURL || (config.apiKey && config.projectId));

let app: FirebaseApp | null = null;
let db: Database | null = null;

export function getFirebaseClientDb(): Database | null {
  if (typeof window === 'undefined') return null;
  if (!hasFirebaseClient) return null;
  if (db) return db;

  try {
    setupDiscordUrlMappings();
    app = getApps().length > 0 ? getApp() : initializeApp(config);
    forceWebSockets();
    db = getDatabase(app);
    return db;
  } catch (err) {
    console.error('[FirebaseClient] Initialization failed:', err);
    return null;
  }
}

