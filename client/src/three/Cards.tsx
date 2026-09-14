'use client';
import * as THREE from 'three';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { canPlay, canJumpIn, face, hotkeyCard, type Card, type CardColor, type DeckSide, type GameState } from '@u-no/game-engine';
import { useMatch, type FxItem } from '@/src/state/match';
import { useTurnHold } from '@/src/state/useTurnHold';
import {
  CARD_FLIGHT_MS, DEAL_STAGGER_MS, DRAW_FAST_DUR_MS, DRAW_FAST_STAGGER_MS, DRAW_SLOW_MS, SWAP_FLY_MS, SWAP_GATHER_MS,
} from '@/src/state/timeline';
import { CardMesh, warmCardMaterials } from './CardMesh';
import { DECK_POS, DISCARD_POS, deckTransform, discardTransform, fanTransform, seatIndex, seatPos } from './layout';
import { resetForNewRound, setSpawnOrigin, setTarget, shake, tick } from './stage';
import { PHOTO_BACK_NAME, resolvePhotoSprite, usePhotoAtlas, type PhotoAtlas } from './photoAtlas';
import { gfxOf, useSettings } from '@/src/lib/settings';
import { playSfx } from '@/src/lib/audio';

interface Item {
  card: Card;
  zone: 'hand' | 'discard' | 'deck';
  ownerIdx: number;
  index: number;
  layerIndex: number;
  count: number;
  mine: boolean;
  spawnPos?: THREE.Vector3;
  spawnRot?: THREE.Euler;
}

// Thu tu sap xep bai chinh dien: Light (red/yellow/green/blue) va Dark (pink/teal/orange/purple)
const COLOR_ORDER: Record<string, number> = {
  red: 0, yellow: 1, green: 2, blue: 3,
  pink: 0, teal: 1, orange: 2, purple: 3,
  wild: 4,
};
const VALUE_ORDER: Record<string, number> = {
  '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  'flip': 10, 'skip': 11, 'skipAll': 11, 'reverse': 12, 'draw1': 13, 'draw2': 13, 'draw5': 13,
  'wild': 20, 'wild2': 21, 'wild4': 21, 'wildColor': 22,
};

const DECK_LAYERS = 6;

/**
 * Animation doi tay bai (luat 0/7): gom -> bay -> xoe, tong ~1100ms.
 *  - 'swap'   (la 7): 2 nguoi doi tay cho nhau.
 *  - 'rotate' (la 0): ca ban chuyen sang nguoi ke theo chieu choi.
 */
type HandoverAnim =
  | { kind: 'swap'; a: string; b: string; at: number }
  | { kind: 'rotate'; direction: 1 | -1; at: number };

/** Tra ve index chu cu cua la truoc khi doi tay. */
function formerOwnerIdx(anim: HandoverAnim, ownerIdx: number, ownerId: string, players: { id: string }[]): number {
  const n = players.length;
  if (anim.kind === 'rotate') return ((ownerIdx - anim.direction) % n + n) % n;
  if (ownerId !== anim.a && ownerId !== anim.b) return -1;
  return players.findIndex((p) => p.id === (ownerId === anim.a ? anim.b : anim.a));
}

function collect(state: GameState, myId: string, maxDiscard: number, maxOpp: number): Item[] {
  const out: Item[] = [];
  const n = state.players.length;
  const myIdx = Math.max(0, state.players.findIndex((p) => p.id === myId));

  state.players.forEach((p, pi) => {
    const mine = p.id === myId;
    let visible = p.hand;
    if (mine) {
      visible = p.hand.slice().sort((a, b) => {
        const fa = face(a, state.side), fb = face(b, state.side);
        const ca = COLOR_ORDER[fa.color] ?? 99, cb = COLOR_ORDER[fb.color] ?? 99;
        if (ca !== cb) return ca - cb;
        const va = VALUE_ORDER[fa.value] ?? 99, vb = VALUE_ORDER[fb.value] ?? 99;
        if (va !== vb) return va - vb;
        return a.id.localeCompare(b.id);
      });
    } else {
      // Gioi han 10 la cuoi -- la moi rut luon nam cuoi tay -> luon thay animation
      visible = p.hand.slice(-10);
    }
    visible.forEach((card, i) => {
      out.push({ card, zone: 'hand', ownerIdx: pi, index: i, layerIndex: i, count: visible.length, mine });
    });
  });

  const discardSlice = state.discard.slice(-maxDiscard);
  discardSlice.forEach((card, i, arr) => {
    const pileIndex = state.discard.length - arr.length + i;
    out.push({ card, zone: 'discard', ownerIdx: -1, index: pileIndex, layerIndex: i, count: arr.length, mine: false });
  });

  for (let i = 0; i < DECK_LAYERS; i++) {
    out.push({
      card: { id: `deck-slot-${i}`, light: { color: 'wild', value: 'wild' }, hidden: true },
      zone: 'deck', ownerIdx: -1, index: i, layerIndex: i, count: DECK_LAYERS, mine: false,
    });
  }

  void myIdx; void n; void maxOpp;
  return out;
}

/** Loe sang tai dong discard khi danh la chuc nang -- animation 0.5s, tu tat. */
function PlayFlash({ state, fx }: { state: GameState; fx: FxItem[] }) {
  let latest: FxItem | null = null;
  for (const f of fx) {
    const payload = f.payload;
    if (payload.t !== 'play') continue;
    const card = state.discard.find((c) => c.id === payload.cardId);
    if (!card) continue;
    const fa = face(card, state.side);
    const isFunctionCard = fa.color === 'wild' || !/^\d$/.test(fa.value);
    if (isFunctionCard && (!latest || f.at > latest.at)) latest = f;
  }
  if (!latest) return null;
  return (
    <Html position={[DISCARD_POS.x, 0.08, DISCARD_POS.z]} center zIndexRange={[3, 0]} style={{ pointerEvents: 'none' }}>
      <div
        key={latest.id}
        style={{
          width: 140, height: 140, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,211,77,.9), rgba(255,150,40,.35) 55%, rgba(255,150,40,0) 72%)',
          animation: 'playFlash 0.5s ease-out forwards',
        }}
      />
    </Html>
  );
}

/**
 * Hien "+N" tren dau nguoi dang bi chong phat -- suy tu state (drawRun rut tung la, moi event chi con 1 la).
 */
function DrawTotalPopups({ state, myId, fx }: { state: GameState; myId: string; fx: FxItem[] }) {
  const n = state.players.length;
  const myIdx = Math.max(0, state.players.findIndex((p) => p.id === myId));

  let amount = 0;
  let victimId = state.players[state.turn]?.id;

  if (state.pending && state.pending.value !== 'drawColor') {
    amount = state.pending.amount;
  } else if (state.drawRun?.penalty && state.drawRun.kind === 'fixed') {
    amount = state.drawRun.count + (state.drawRun.remaining ?? 0);
  } else {
    const recentDraw = fx[fx.length - 1];
    if (recentDraw?.payload?.t === 'draw' && recentDraw.payload.penalty) {
      amount = recentDraw.payload.cardIds.length;
      victimId = recentDraw.payload.playerId;
    }
  }
  if (amount <= 0 || !victimId) return null;

  const victimIdx = state.players.findIndex((p) => p.id === victimId);
  if (victimIdx < 0) return null;
  const seatJ = seatIndex(victimIdx, myIdx, n);
  const pos = seatPos(seatJ, n, seatJ === 0 ? 2.3 : 1.75);

  return (
    <Html position={[pos.x, 0.95, pos.z]} center zIndexRange={[8, 0]} style={{ pointerEvents: 'none' }}>
      <div
        className="label"
        style={{
          fontSize: 34, fontWeight: 800, color: '#FFD34D',
          textShadow: '0 2px 6px rgba(0,0,0,.85), 0 0 16px rgba(255,140,40,.85)',
          animation: 'drawTotalFly 0.45s ease-out',
        }}
      >
        +{amount}
      </div>
    </Html>
  );
}

export function Cards({ paused = false }: { paused?: boolean }) {
  const state = useMatch((s) => s.state);
  const version = useMatch((s) => s.version);
  const myId = useMatch((s) => s.myId);
  const fx = useMatch((s) => s.fx);
  const dealSeq = useMatch((s) => s.dealSeq);
  const act = useMatch((s) => s.act);
  const graphics = useSettings((s) => s.graphics);
  const gfx = gfxOf(graphics);
  const holding = useTurnHold();
  const sCardId = state && !holding ? hotkeyCard(state, myId)?.id : undefined;

  const lastRound = useRef(-1);
  const lastDeal = useRef(-1);
  const dealingUntil = useRef(0);
  const [fontsReady, setFontsReady] = useState(false);
  const [hoveredColor, setHoveredColor] = useState<CardColor | null>(null);
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
  const knownCardsByPlayer = useRef<Map<string, Set<string>>>(new Map());

  // Animation doi tay bai (luat 0/7) -- luu trong ref, swapTick ep re-run effect khi chuyen chang
  const swapRef = useRef<HandoverAnim | null>(null);
  const [swapTick, setSwapTick] = useState(0);

  const handoverFx = useMemo(() => {
    let latest: FxItem | null = null;
    for (const f of fx) {
      if ((f.payload?.t === 'swap' || f.payload?.t === 'rotate') && (!latest || f.id > latest.id)) latest = f;
    }
    return latest;
  }, [fx]);
  const handoverId = handoverFx?.id ?? -1;

  // Dep la ID cua fx trao bai -- khong phai mang fx (pushFx tra mang moi moi lan commit)
  useEffect(() => {
    const p = handoverFx?.payload;
    if (!p) return;
    if (p.t === 'swap') swapRef.current = { kind: 'swap', a: p.a, b: p.b, at: Date.now() };
    else if (p.t === 'rotate') swapRef.current = { kind: 'rotate', direction: p.direction, at: Date.now() };
    else return;
    const t1 = setTimeout(() => setSwapTick((v) => v + 1), SWAP_GATHER_MS);
    const t2 = setTimeout(() => { swapRef.current = null; setSwapTick((v) => v + 1); }, SWAP_GATHER_MS + SWAP_FLY_MS);
    return () => { clearTimeout(t1); clearTimeout(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handoverId]);

  // Debounce tat hover card (140ms) -- tranh "chop" khi la nhac len lam chuot roi ra ngoai
  const hoverClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setHoveredCardDebounced = useCallback((id: string | null) => {
    if (hoverClearTimer.current) { clearTimeout(hoverClearTimer.current); hoverClearTimer.current = null; }
    if (id !== null) { setHoveredCardId(id); return; }
    hoverClearTimer.current = setTimeout(() => setHoveredCardId(null), 140);
  }, []);
  useEffect(() => () => { if (hoverClearTimer.current) clearTimeout(hoverClearTimer.current); }, []);

  // Debounce tat hover mau (180ms)
  const hoverColorClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setHoveredColorDebounced = useCallback((color: string | null) => {
    if (hoverColorClearTimer.current) { clearTimeout(hoverColorClearTimer.current); hoverColorClearTimer.current = null; }
    if (color !== null) { setHoveredColor(color as CardColor); return; }
    hoverColorClearTimer.current = setTimeout(() => setHoveredColor(null), 180);
  }, []);
  useEffect(() => () => { if (hoverColorClearTimer.current) clearTimeout(hoverColorClearTimer.current); }, []);

  // Luu vet nguoi vua danh tung cardId (dong bo tu fx)
  const cardShooterMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of fx) {
      if (f.payload?.t === 'play' && f.payload.cardId && f.payload.playerId)
        map.set(f.payload.cardId, f.payload.playerId);
    }
    return map;
  }, [fx]);

  // La vua bi rut phat (+2/+4/+5 hoac timeout)
  const penaltyDrawIds = useMemo(() => {
    const set = new Set<string>();
    for (const f of fx) {
      if (f.payload?.t === 'draw' && f.payload.penalty)
        for (const id of f.payload.cardIds) set.add(id);
    }
    return set;
  }, [fx]);

  // La rut nhanh (fast draw -- so la da biet truoc)
  const fastDrawIds = useMemo(() => {
    const set = new Set<string>();
    for (const f of fx) {
      if (f.payload?.t === 'draw' && f.payload.fast)
        for (const id of f.payload.cardIds) set.add(id);
    }
    return set;
  }, [fx]);

  // Tat ca la vua rut tu bo bai -- chi nhung la nay moi duoc bay stagger tung la
  const drawnCardIds = useMemo(() => {
    const set = new Set<string>();
    for (const f of fx) {
      if (f.payload?.t === 'draw')
        for (const id of f.payload.cardIds) set.add(id);
    }
    return set;
  }, [fx]);

  // Atlas anh that -- Flip can ca light lan dark (lat mat bat cu luc nao)
  const isFlipDeck = state?.deckType === 'flip';
  const variantA = isFlipDeck ? 'flipLight' : 'std';
  const variantB = isFlipDeck ? 'flipDark' : null;
  const atlasA = usePhotoAtlas(variantA);
  const atlasB = usePhotoAtlas(variantB);
  const wantStandard = gfx.standardMaterial;
  useEffect(() => {
    if (atlasA) warmCardMaterials(atlasA, wantStandard);
    if (atlasB) warmCardMaterials(atlasB, wantStandard);
  }, [atlasA, atlasB, wantStandard]);

  const photoAtlasFor = useCallback(
    (side: 'light' | 'dark'): PhotoAtlas | null => (isFlipDeck && side === 'dark' ? atlasB : atlasA),
    [isFlipDeck, atlasA, atlasB],
  );

  const getShooterHandPos = useCallback((cardId: string): THREE.Vector3 => {
    if (!state) return DECK_POS.clone();
    const n = state.players.length;
    const myIdx = Math.max(0, state.players.findIndex((p) => p.id === myId));
    let shooterId = cardShooterMap.get(cardId);
    if (!shooterId && state.resume?.cardId === cardId) shooterId = state.resume.playerId;
    if (!shooterId && state.discard.length > 0 && state.discard[state.discard.length - 1].id === cardId) {
      shooterId = state.resume?.playerId;
      if (!shooterId) {
        const prevIdx = (((state.turn - state.direction) % n) + n) % n;
        shooterId = state.players[prevIdx]?.id;
      }
    }
    if (shooterId === myId) return new THREE.Vector3(0, 0.45, 2.14);
    if (shooterId) {
      const shooterIdx = state.players.findIndex((p) => p.id === shooterId);
      if (shooterIdx >= 0) {
        const shooterSeatJ = seatIndex(shooterIdx, myIdx, n);
        const p = seatPos(shooterSeatJ, n, 2.15);
        return new THREE.Vector3(p.x, 0.45, p.z);
      }
    }
    return DECK_POS.clone();
  }, [state, myId, cardShooterMap]);

  useEffect(() => {
    let dead = false;
    const done = () => { if (!dead) setFontsReady(true); };
    if (typeof document !== 'undefined' && document.fonts) document.fonts.ready.then(done);
    else done();
    return () => { dead = true; };
  }, []);

  const items = useMemo(
    () => (state ? collect(state, myId, gfx.maxDiscard, gfx.maxOppCards) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version, state, myId, gfx.maxDiscard, gfx.maxOppCards],
  );

  // Accordion (fan xoe > 10 la)
  const accordionProgress = useMemo(() => {
    if (!state) return new Map<string, number>();
    const myItems = items.filter((it) => it.mine && it.zone === 'hand');
    const result = new Map<string, number>();
    if (myItems.length <= 1) { if (myItems[0]) result.set(myItems[0].card.id, 0); return result; }

    if (myItems.length <= 10) {
      myItems.forEach((it, i) => result.set(it.card.id, (i / (myItems.length - 1)) - 0.5));
      return result;
    }

    // > 10 la: gom cum theo mau, hover thi nhom do mo rong
    const weights: number[] = [];
    const interGaps: boolean[] = [];
    let prevColor: string | null = null;
    for (let i = 0; i < myItems.length; i++) {
      const col = face(myItems[i].card, state.side).color;
      const w = hoveredColor ? (col === hoveredColor ? 1.45 : 0.65) : 0.9;
      interGaps.push(prevColor !== null && prevColor !== col);
      prevColor = col;
      weights.push(w);
    }
    let totalWeight = 0;
    for (let i = 0; i < weights.length; i++) { if (interGaps[i]) totalWeight += 0.10; totalWeight += weights[i]; }
    let currentWeight = 0;
    for (let i = 0; i < myItems.length; i++) {
      if (interGaps[i]) currentWeight += 0.10;
      const w = weights[i];
      const centerWeight = currentWeight + w * 0.5;
      currentWeight += w;
      result.set(myItems[i].card.id, totalWeight > 0 ? (centerWeight / totalWeight) - 0.5 : 0);
    }
    return result;
  }, [items, state, hoveredColor]);

  useEffect(() => {
    if (!state) {
      lastRound.current = -1;
      lastDeal.current = -1;
      dealingUntil.current = 0;
      return;
    }
    if (paused) return;
    const n = state.players.length;
    const myIdx = Math.max(0, state.players.findIndex((p) => p.id === myId));
    const sw = swapRef.current;
    const swElapsed = sw ? Date.now() - sw.at : 0;
    const swPhase: 0 | 1 | null = !sw ? null
      : swElapsed < SWAP_GATHER_MS ? 0
      : swElapsed < SWAP_GATHER_MS + SWAP_FLY_MS ? 1 : null;

    // Hai tín hiệu nhận biết ván mới: dealSeq (event thật) + roundNo (có trong resync/rematch)
    const dealing = dealSeq !== lastDeal.current || (state.roundNo !== lastRound.current && state.roundNo > 0);
    if (dealing) {
      lastDeal.current = dealSeq;
      lastRound.current = state.roundNo;
      knownCardsByPlayer.current.clear();
      resetForNewRound(DECK_POS);
      const totalCards = n * (state.rules.startingCards || 7);
      dealingUntil.current = Date.now() + totalCards * DEAL_STAGGER_MS + CARD_FLIGHT_MS + 400;
    }

    const isDealingActive = dealing || Date.now() < dealingUntil.current;
    const newCardsThisUpdate = new Map<string, number>();

    for (const it of items) {
      if (it.zone === 'deck') {
        const t = deckTransform(it.index);
        setTarget(it.card.id, t.p, t.q, t.s, { snapIfFresh: true });
        continue;
      }

      if (it.zone === 'discard') {
        const t = discardTransform(it.index, it.layerIndex);
        const isFirstCardOfRound = it.index === 0;
        if (!isFirstCardOfRound) {
          const shooterHandPos = getShooterHandPos(it.card.id);
          setSpawnOrigin(it.card.id, shooterHandPos, new THREE.Euler(-Math.PI / 2, 0, 0));
        }
        setTarget(it.card.id, t.p, t.q, t.s, { arc: 0.85, dur: CARD_FLIGHT_MS / 1000, snapIfFresh: isFirstCardOfRound });
        continue;
      }

      const seatJ = seatIndex(it.ownerIdx, myIdx, n);

      // Luat 0/7 -- gom -> bay -> xoe
      const ownerId = state.players[it.ownerIdx]?.id ?? '';
      if (sw && swPhase !== null) {
        const formerIdx = formerOwnerIdx(sw, it.ownerIdx, ownerId, state.players);
        const holderIdx = formerIdx < 0 ? -1 : swPhase === 0 ? formerIdx : it.ownerIdx;
        if (holderIdx >= 0) {
          const mineHolder = state.players[holderIdx]?.id === myId;
          const g = fanTransform(seatIndex(holderIdx, myIdx, n), n, 0, 1, { self: mineHolder, faceUp: mineHolder });
          setTarget(it.card.id, g.p, g.q, g.s, {
            delay: 0,
            dur: (swPhase === 0 ? SWAP_GATHER_MS : SWAP_FLY_MS) / 1000,
            arc: swPhase === 0 ? 0.08 : 0.75,
          });
          continue;
        }
      }

      let delay = 0;
      const pId = state.players[it.ownerIdx]?.id ?? '';
      let knownSet = knownCardsByPlayer.current.get(pId);
      if (!knownSet) { knownSet = new Set(); knownCardsByPlayer.current.set(pId, knownSet); }
      const isNewCard = !knownSet.has(it.card.id);
      const isInitialDeal = isDealingActive || (knownSet.size === 0 && it.count >= 5);
      const isJustDrawn = drawnCardIds.has(it.card.id);

      const customProgress = it.mine ? accordionProgress.get(it.card.id) : undefined;
      const isHovered = it.mine && it.card.id === hoveredCardId;
      const hoverProgress = it.mine && hoveredCardId ? accordionProgress.get(hoveredCardId) : undefined;
      const t = fanTransform(seatJ, n, it.index, it.count, {
        self: it.mine, faceUp: it.mine, customProgress,
        layerOrder: it.mine ? it.layerIndex : undefined,
        hoverProgress, isHovered,
      });

      const isFast = fastDrawIds.has(it.card.id);
      const durMs = isFast ? DRAW_FAST_DUR_MS : DRAW_SLOW_MS;
      const staggerMs = isFast ? DRAW_FAST_STAGGER_MS : DRAW_SLOW_MS;

      if (isInitialDeal) {
        delay = (it.index * n + seatJ) * (DEAL_STAGGER_MS / 1000);
      } else if (isNewCard && isJustDrawn) {
        const orderIndex = newCardsThisUpdate.get(pId) ?? 0;
        newCardsThisUpdate.set(pId, orderIndex + 1);
        delay = orderIndex * (staggerMs / 1000);
        setSpawnOrigin(it.card.id, DECK_POS.clone(), new THREE.Euler(-Math.PI / 2, 0, 0));
      }

      setTarget(it.card.id, t.p, t.q, t.s, {
        delay,
        dur: (isInitialDeal ? CARD_FLIGHT_MS : isNewCard && isJustDrawn ? durMs : CARD_FLIGHT_MS) / 1000,
        arc: isInitialDeal ? 0.95 : isNewCard && isJustDrawn ? 0.65 : 0.25,
        snapIfFresh: !isInitialDeal && !isJustDrawn,
      });
    }

    for (const p of state.players) {
      const set = knownCardsByPlayer.current.get(p.id) ?? new Set();
      p.hand.forEach((c) => set.add(c.id));
      knownCardsByPlayer.current.set(p.id, set);
    }
  }, [items, state, myId, version, dealSeq, paused, accordionProgress, getShooterHandPos, hoveredCardId, penaltyDrawIds, drawnCardIds, fastDrawIds, swapTick]);

  useFrame((_, dt) => tick(Math.min(dt, 0.05), gfx.smoothing, gfx.linear));

  if (!state || !fontsReady) return null;

  return (
    <group>
      {items.map((it) => {
        // Bai da danh giu mat luc danh (playedSide), tru la tren dinh luon theo state.side
        const isTopDiscard = it.zone === 'discard' && it.index === state.discard.length - 1;
        const displaySide = it.zone === 'discard' && !isTopDiscard
          ? (state.playedSide?.[it.card.id] ?? state.side)
          : state.side;
        const f = face(it.card, displaySide);

        // Bai sang vien chi khi CO THE danh VA khong dang chay animation (holding)
        const myTurnNow = state.turn === it.ownerIdx;
        const canJump = !myTurnNow && canJumpIn(it.card, state);
        const playable = it.mine && state.phase === 'awaitPlay' && !holding &&
          (myTurnNow ? canPlay(it.card, state) : canJump);

        // Wild da chon mau -> hien mau do vinh vien
        const rememberedColor = f.color === 'wild' ? state.wildColors?.[it.card.id] : undefined;
        const hasChosenColor = !!rememberedColor;
        const displayColor = rememberedColor ?? f.color;

        const photoAtlas = photoAtlasFor(displaySide);
        // Truyen f.color (luon la 'wild') chu khong phai displayColor -- resolvePhotoSprite can detect wild
        const photoFaceName = photoAtlas
          ? resolvePhotoSprite(photoAtlas.variant, f.color, f.value, hasChosenColor ? displayColor : undefined)
          : null;

        // Flip: mat lung = mat con lai that cua la (khong co logo back chung)
        let photoBackAtlas: PhotoAtlas | null | undefined;
        let photoBackNameFinal: string | null;
        if (state.deckType === 'flip' && it.zone !== 'deck') {
          const otherSide: DeckSide = state.side === 'light' ? 'dark' : 'light';
          const otherFace = face(it.card, otherSide);
          const otherAtlas = photoAtlasFor(otherSide);
          photoBackAtlas = otherAtlas;
          photoBackNameFinal = otherAtlas
            ? resolvePhotoSprite(otherAtlas.variant, otherFace.color, otherFace.value) : null;
        } else if (state.deckType === 'flip' && it.zone === 'deck') {
          // Chong rut Flip: mat ngua = mat con lai cua la sap rut
          const otherSide: DeckSide = state.side === 'light' ? 'dark' : 'light';
          const otherAtlas = photoAtlasFor(otherSide);
          const top = state.drawPile[state.drawPile.length - 1];
          photoBackAtlas = otherAtlas;
          photoBackNameFinal = otherAtlas && top
            ? resolvePhotoSprite(otherAtlas.variant, face(top, otherSide).color, face(top, otherSide).value)
            : null;
        } else {
          photoBackAtlas = undefined;
          photoBackNameFinal = photoAtlas?.has(PHOTO_BACK_NAME) ? PHOTO_BACK_NAME : null;
        }

        // Fallback: luon co mat lung -- atlas Light/std luon co 'back_side'
        if (!photoBackNameFinal) {
          const fallback = photoAtlasFor('light');
          if (fallback?.has(PHOTO_BACK_NAME)) { photoBackAtlas = fallback; photoBackNameFinal = PHOTO_BACK_NAME; }
        }

        let spawnPos: THREE.Vector3 | undefined;
        let spawnRot: THREE.Euler | undefined;
        if (it.zone === 'discard') {
          spawnRot = new THREE.Euler(-Math.PI / 2, 0, 0);
          spawnPos = it.index === 0 ? DECK_POS.clone() : getShooterHandPos(it.card.id);
        } else if (drawnCardIds.has(it.card.id)) {
          spawnRot = new THREE.Euler(-Math.PI / 2, 0, 0);
          spawnPos = DECK_POS.clone();
        }

        return (
          <CardMesh
            key={it.card.id}
            id={it.card.id}
            isMe={it.mine}
            standard={gfx.standardMaterial}
            shadows={gfx.shadows}
            sides={it.mine || it.zone === 'discard' ? 'both' : 'back'}
            photoAtlas={photoAtlas}
            photoFaceName={photoFaceName}
            photoBackAtlas={photoBackAtlas}
            photoBackName={photoBackNameFinal}
            interactive={(it.mine || it.zone === 'deck') && !holding}
            playable={playable}
            jumpIn={playable && !myTurnNow}
            hotkey={it.card.id === sCardId ? 'S' : undefined}
            layerIndex={it.layerIndex}
            spawnPos={spawnPos}
            spawnRot={spawnRot}
            cardColor={f.color}
            onHoverColor={it.mine ? setHoveredColorDebounced : undefined}
            onHoverCard={it.mine ? setHoveredCardDebounced : undefined}
            onSelect={
              it.zone === 'deck'
                ? () => act({ type: 'DRAW', playerId: myId })
                : (id) => {
                    if (!playable) { shake(id); playSfx('click', 0.6); return; }
                    act({ type: 'PLAY', playerId: myId, cardId: id });
                  }
            }
          />
        );
      })}
      <DrawTotalPopups state={state} myId={myId} fx={fx} />
      <PlayFlash state={state} fx={fx} />
    </group>
  );
}
