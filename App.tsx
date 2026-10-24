import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

/* ------------------------------------------------------------------ */
/*  Pixel art (1 char = 1 pixel block)                                 */
/* ------------------------------------------------------------------ */

const DINO_BODY = [
  '........######..',
  '.......########.',
  '.......##.#####.',
  '.......#########',
  '.......########.',
  '.......####.....',
  '.#.....#####....',
  '.#....#######...',
  '.#...########...',
  '.##.##########..',
  '.#############..',
  '..############..',
  '...##########...',
  '....########....',
];

const DINO_RUN_A = [
  ...DINO_BODY,
  '....###..###....',
  '....###...###...',
  '...##......##...',
  '..##........##..',
];

const DINO_RUN_B = [
  ...DINO_BODY,
  '....###..###....',
  '....###...###...',
  '.....##...##....',
  '.....##....##...',
];

const CACTUS_SMALL = [
  '...###...',
  '...###...',
  '.#.###...',
  '.#.###.#.',
  '.#####.#.',
  '...#####.',
  '...###...',
  '...###...',
  '...###...',
  '...###...',
  '...###...',
  '...###...',
];

const CACTUS_LARGE = [
  '...###...###...',
  '...###...###...',
  '.#.###...###...',
  '.#.###.#.###.#.',
  '.#####.#####.#.',
  '...#########.#.',
  '...###...#####.',
  '...###...###...',
  '...###...###...',
  '...###...###...',
  '...###...###...',
  '...###...###...',
];

const PixelSprite = React.memo(function PixelSprite({
  rows,
  pixel,
  color,
}: {
  rows: string[];
  pixel: number;
  color: string;
}) {
  const blocks = useMemo(() => {
    const out: { x: number; y: number }[] = [];
    rows.forEach((line, y) => {
      for (let x = 0; x < line.length; x += 1) {
        if (line[x] === '#') out.push({ x, y });
      }
    });
    return out;
  }, [rows]);

  return (
    <View
      pointerEvents="none"
      style={{ width: rows[0].length * pixel, height: rows.length * pixel }}
    >
      {blocks.map((b) => (
        <View
          key={`${b.x}-${b.y}`}
          style={{
            position: 'absolute',
            left: b.x * pixel,
            top: b.y * pixel,
            width: pixel,
            height: pixel,
            backgroundColor: color,
          }}
        />
      ))}
    </View>
  );
});

/* ------------------------------------------------------------------ */
/*  Tuning                                                             */
/* ------------------------------------------------------------------ */

const PIXEL = 3.2;
const DINO_W = 16 * PIXEL;
const DINO_H = 18 * PIXEL;
const GROUND_TOP = 22; // px from bottom of the arena to the ground line
const DINO_LEFT = 34;

const GRAVITY = 2400;
const JUMP_V = -980;
const START_SPEED = 340;
const MAX_SPEED = 980;
const ACCEL = 22;

const INK = '#535353';
const PAPER = '#f7f7f7';

type Obstacle = { id: number; x: number; w: number; h: number; rows: string[] };
type Phase = 'ready' | 'running' | 'dead';

function DinoGame() {
  const { width: SCREEN_W } = Dimensions.get('window');

  const [phase, setPhase] = useState<Phase>('ready');
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [obstacles, setObstacles] = useState<Obstacle[]>([]);
  const [dinoY, setDinoY] = useState(0);
  const [legFrame, setLegFrame] = useState(0);
  const [scroll, setScroll] = useState(0);

  const phaseRef = useRef<Phase>('ready');
  const yRef = useRef(0);
  const vyRef = useRef(0);
  const speedRef = useRef(START_SPEED);
  const obstaclesRef = useRef<Obstacle[]>([]);
  const distanceRef = useRef(0);
  const nextSpawnRef = useRef(0);
  const idRef = useRef(0);
  const lastTsRef = useRef<number | null>(null);
  const legTimerRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  /* -------- best score -------- */
  useEffect(() => {
    AsyncStorage.getItem('dino:best')
      .then((v) => {
        const n = v ? parseInt(v, 10) : 0;
        if (!Number.isNaN(n)) setBest(n);
      })
      .catch(() => {});
  }, []);

  /* -------- actions -------- */
  const reset = useCallback(() => {
    phaseRef.current = 'ready';
    yRef.current = 0;
    vyRef.current = 0;
    speedRef.current = START_SPEED;
    obstaclesRef.current = [];
    distanceRef.current = 0;
    nextSpawnRef.current = 0;
    lastTsRef.current = null;
    legTimerRef.current = 0;
    setPhase('ready');
    setObstacles([]);
    setScore(0);
    setDinoY(0);
    setScroll(0);
    setLegFrame(0);
  }, []);

  const tap = useCallback(() => {
    if (phaseRef.current === 'dead') {
      reset();
      return;
    }
    if (phaseRef.current === 'ready') {
      phaseRef.current = 'running';
      setPhase('running');
      lastTsRef.current = null;
      vyRef.current = JUMP_V;
      nextSpawnRef.current = 1.1;
      return;
    }
    if (yRef.current <= 0.5) {
      vyRef.current = JUMP_V;
    }
  }, [reset]);

  /* -------- main loop -------- */
  useEffect(() => {
    const spawn = (fromX: number) => {
      const rows = Math.random() < 0.32 ? CACTUS_LARGE : CACTUS_SMALL;
      idRef.current += 1;
      obstaclesRef.current.push({
        id: idRef.current,
        x: fromX,
        w: rows[0].length * PIXEL,
        h: rows.length * PIXEL,
        rows,
      });
    };

    const step = (ts: number) => {
      rafRef.current = requestAnimationFrame(step);

      if (phaseRef.current !== 'running') {
        lastTsRef.current = ts;
        return;
      }
      if (lastTsRef.current == null) {
        lastTsRef.current = ts;
        return;
      }
      let dt = (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;
      if (dt > 0.05) dt = 0.05;
      if (dt <= 0) return;

      // physics
      vyRef.current += GRAVITY * dt;
      yRef.current -= vyRef.current * dt;
      if (yRef.current < 0) {
        yRef.current = 0;
        vyRef.current = 0;
      }

      // speed / distance
      speedRef.current = Math.min(MAX_SPEED, speedRef.current + ACCEL * dt);
      distanceRef.current += speedRef.current * dt;
      const dx = speedRef.current * dt;

      // hit boxes
      const dL = DINO_LEFT + 6;
      const dR = DINO_LEFT + DINO_W - 8;
      const dBottom = yRef.current;
      const dTop = yRef.current + DINO_H - 6;

      let dead = false;
      const moved: Obstacle[] = [];
      for (const o of obstaclesRef.current) {
        const nx = o.x - dx;
        if (nx + o.w < -40) continue;
        const oL = nx + o.w * 0.22;
        const oR = nx + o.w * 0.78;
        const oTop = o.h - 5;
        if (dR > oL && dL < oR && dTop > 0 && dBottom < oTop) dead = true;
        moved.push({ ...o, x: nx });
      }
      obstaclesRef.current = moved;

      // spawn by time gap (fair at every speed)
      nextSpawnRef.current -= dt;
      if (nextSpawnRef.current <= 0) {
        const before = obstaclesRef.current.length;
        spawn(SCREEN_W + 30);
        const last = obstaclesRef.current[before];
        const extra = last ? last.w / Math.max(220, speedRef.current) : 0;
        nextSpawnRef.current = 0.85 + Math.random() * 0.75 + extra;
      }

      // legs
      legTimerRef.current += dt;
      const frame = Math.floor(legTimerRef.current * 8) % 2;

      if (dead) {
        phaseRef.current = 'dead';
        const final = Math.floor(distanceRef.current / 26);
        setPhase('dead');
        setScore(final);
        setBest((prev) => {
          if (final > prev) {
            AsyncStorage.setItem('dino:best', String(final)).catch(() => {});
            return final;
          }
          return prev;
        });
      } else {
        setScore(Math.floor(distanceRef.current / 26));
      }

      setDinoY(yRef.current);
      setObstacles(moved);
      setScroll(distanceRef.current % 56);
      setLegFrame(frame);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [SCREEN_W]);

  const dinoSprite = useMemo(() => {
    if (phase !== 'running') return DINO_RUN_A;
    return legFrame === 0 ? DINO_RUN_A : DINO_RUN_B;
  }, [phase, legFrame]);

  const pebbles = useMemo(
    () => Array.from({ length: Math.ceil(SCREEN_W / 56) + 2 }, (_, i) => i),
    [SCREEN_W],
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.hud}>
        <Text style={styles.hudHi}>HI {String(best).padStart(5, '0')}</Text>
        <Text style={styles.hudScore}>{String(score).padStart(5, '0')}</Text>
      </View>

      <Pressable
        style={styles.arena}
        onPress={tap}
        android_disableSound
        accessibilityLabel="Zone de jeu, toucher pour sauter"
      >
        <View style={styles.horizon} pointerEvents="none" />

        {/* ground */}
        <View style={styles.groundLine} pointerEvents="none" />
        <View style={styles.groundStrip} pointerEvents="none">
          {pebbles.map((i) => (
            <View key={i} style={[styles.pebble, { left: i * 56 - scroll }]} />
          ))}
        </View>

        {/* dino */}
        <View
          style={[styles.dinoWrap, { bottom: GROUND_TOP + dinoY }]}
          pointerEvents="none"
        >
          <PixelSprite rows={dinoSprite} pixel={PIXEL} color={INK} />
        </View>

        {/* obstacles */}
        {obstacles.map((o) => (
          <View
            key={o.id}
            pointerEvents="none"
            style={{ position: 'absolute', left: o.x, bottom: GROUND_TOP }}
          >
            <PixelSprite rows={o.rows} pixel={PIXEL} color={INK} />
          </View>
        ))}

        {/* overlays */}
        {phase === 'ready' && (
          <View style={styles.overlay} pointerEvents="none">
            <Text style={styles.title}>DINO RUN</Text>
            <Text style={styles.hint}>Touchez pour sauter</Text>
            <Text style={styles.subhint}>Évitez les cactus</Text>
          </View>
        )}

        {phase === 'dead' && (
          <View style={styles.overlay} pointerEvents="none">
            <Text style={styles.title}>GAME OVER</Text>
            <Text style={styles.hint}>
              Score {score}   ·   Record {best}
            </Text>
            <Text style={styles.subhint}>Touchez pour rejouer</Text>
          </View>
        )}
      </Pressable>
      <StatusBar style="dark" />
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <View style={styles.root}>
        <DinoGame />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: PAPER },
  safe: { flex: 1, backgroundColor: PAPER },
  hud: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 20,
    paddingHorizontal: 24,
    paddingTop: 6,
    paddingBottom: 8,
    overflow: 'hidden',
  },
  hudHi: {
    fontFamily: 'Courier',
    fontSize: 14,
    letterSpacing: 2,
    color: '#a8a8a8',
  },
  hudScore: {
    fontFamily: 'Courier',
    fontSize: 14,
    letterSpacing: 2,
    color: INK,
  },
  arena: { flex: 1, overflow: 'hidden' },
  horizon: {
    position: 'absolute',
    left: -40,
    right: -40,
    bottom: 170,
    height: 1,
    backgroundColor: '#eeeeee',
  },
  dinoWrap: { position: 'absolute', left: DINO_LEFT },
  groundLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: GROUND_TOP,
    height: 2,
    backgroundColor: INK,
  },
  groundStrip: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: GROUND_TOP,
  },
  pebble: {
    position: 'absolute',
    bottom: 8,
    width: 18,
    height: 2,
    backgroundColor: '#cfcfcf',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 120,
  },
  title: {
    fontFamily: 'Courier',
    fontSize: 25,
    letterSpacing: 6,
    color: INK,
    marginBottom: 16,
  },
  hint: {
    fontFamily: 'Courier',
    fontSize: 14,
    letterSpacing: 1,
    color: INK,
    marginBottom: 8,
  },
  subhint: {
    fontFamily: 'Courier',
    fontSize: 12,
    letterSpacing: 1,
    color: '#a8a8a8',
  },
});
