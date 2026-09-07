// Web polyfill for react-native-gesture-handler
import React, { useEffect, useRef } from 'react';
import { View, ViewProps } from 'react-native-web';

// GestureHandlerRootView - just a passthrough View on web
export const GestureHandlerRootView: React.FC<ViewProps & { children?: React.ReactNode }> = ({ 
  children, 
  style,
  ...props 
}) => {
  return React.createElement(View, { style: [{ flex: 1 }, style], ...props }, children);
};

// Basic gesture components - these are just Views on web
export const PanGestureHandler: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  return React.createElement(React.Fragment, null, children);
};

export const TapGestureHandler: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  return React.createElement(React.Fragment, null, children);
};

export const LongPressGestureHandler: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  return React.createElement(React.Fragment, null, children);
};

export const ScrollView = View;
export const FlatList = View;

// Gesture state enum
export const State = {
  UNDETERMINED: 0,
  FAILED: 1,
  BEGAN: 2,
  CANCELLED: 3,
  ACTIVE: 4,
  END: 5,
};

// Direction constants
export const Directions = {
  RIGHT: 1,
  LEFT: 2,
  UP: 4,
  DOWN: 8,
};

// Swipeable component stub
export const Swipeable: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  return React.createElement(React.Fragment, null, children);
};

// RectButton - basic touchable
export const RectButton: React.FC<{ 
  children?: React.ReactNode;
  onPress?: () => void;
  style?: any;
}> = ({ children, onPress, style }) => {
  return React.createElement(
    'div',
    { 
      onClick: onPress,
      style: { cursor: onPress ? 'pointer' : 'default', ...style }
    },
    children
  );
};

export const BaseButton = RectButton;
export const BorderlessButton = RectButton;

// ==================== New Gesture API (Gesture.Pan / GestureDetector) ====================
// Minimal web re-implementation of the subset actually used in this app (interactive
// edge-swipe / drag-to-close drawers). Native platforms use the real gesture-handler —
// this only needs to cover Pan + Exclusive well enough not to feel broken on the web/PWA build.

type Offset = number | number[];
type HitSlopValue =
  | number
  | { left?: number; right?: number; top?: number; bottom?: number; width?: number; height?: number }
  | null;

interface PanEventLike {
  x: number;
  y: number;
  translationX: number;
  translationY: number;
  velocityX: number;
  velocityY: number;
}

// True once `delta` has moved past the given offset — used both for "should this
// activate" (activeOffsetX) and "should this be rejected" (failOffsetY) checks.
function exceedsOffset(offset: Offset | undefined, delta: number): boolean {
  if (offset == null) return Math.abs(delta) > 10;
  if (Array.isArray(offset)) {
    const [min, max] = offset;
    return delta < min || delta > max;
  }
  return offset >= 0 ? delta > offset : delta < offset;
}

function isWithinHitSlop(hitSlop: HitSlopValue, localX: number, localY: number, width: number, height: number): boolean {
  if (hitSlop == null) return true;
  if (typeof hitSlop === 'number') return true;
  const left = hitSlop.left ?? (hitSlop.width != null && hitSlop.right == null ? 0 : -Infinity);
  const right = hitSlop.right != null ? width - hitSlop.right : hitSlop.width != null ? left + hitSlop.width : Infinity;
  const top = hitSlop.top ?? (hitSlop.height != null && hitSlop.bottom == null ? 0 : -Infinity);
  const bottom = hitSlop.bottom != null ? height - hitSlop.bottom : hitSlop.height != null ? top + hitSlop.height : Infinity;
  return localX >= left && localX <= right && localY >= top && localY <= bottom;
}

export class WebPanGesture {
  readonly kind = 'pan' as const;
  _enabled = true;
  _hitSlop: HitSlopValue = null;
  _activeOffsetX?: Offset;
  _failOffsetY?: Offset;
  _onBegin?: (e: PanEventLike) => void;
  _onUpdate?: (e: PanEventLike) => void;
  _onEnd?: (e: PanEventLike) => void;

  enabled(value: boolean) {
    this._enabled = value;
    return this;
  }
  hitSlop(value: HitSlopValue) {
    this._hitSlop = value;
    return this;
  }
  activeOffsetX(value: Offset) {
    this._activeOffsetX = value;
    return this;
  }
  failOffsetY(value: Offset) {
    this._failOffsetY = value;
    return this;
  }
  onBegin(cb: (e: PanEventLike) => void) {
    this._onBegin = cb;
    return this;
  }
  onUpdate(cb: (e: PanEventLike) => void) {
    this._onUpdate = cb;
    return this;
  }
  onEnd(cb: (e: PanEventLike) => void) {
    this._onEnd = cb;
    return this;
  }
}

class WebExclusiveGesture {
  readonly kind = 'exclusive' as const;
  constructor(public gestures: WebPanGesture[]) {}
}

type AnyWebGesture = WebPanGesture | WebExclusiveGesture;

export const Gesture = {
  Pan: () => new WebPanGesture(),
  Exclusive: (...gestures: WebPanGesture[]) => new WebExclusiveGesture(gestures),
};

function flattenGestures(gesture: AnyWebGesture): WebPanGesture[] {
  return gesture.kind === 'exclusive' ? gesture.gestures : [gesture];
}

export const GestureDetector: React.FC<{ gesture: AnyWebGesture; children: React.ReactNode }> = ({
  gesture,
  children,
}) => {
  // Wrapper div with display:contents — doesn't affect layout, just gives us a stable
  // DOM node to attach pointer listeners to (avoids relying on ref-forwarding through
  // arbitrary/animated children).
  const ref = useRef<HTMLDivElement | null>(null);

  // `gesture` is a brand-new object every render (same convention as the real
  // gesture-handler API — callbacks close over the latest props/state). Reading it via a
  // ref that's refreshed every render — rather than as a useEffect dependency — means a
  // re-render triggered mid-gesture (e.g. onBegin calling setState) can't tear down and
  // re-create the listeners, which would otherwise reset the in-progress pan back to
  // 'idle' and silently swallow the rest of the drag. The DOM listeners themselves are
  // attached exactly once, for the lifetime of this component.
  const gestureRef = useRef(gesture);
  gestureRef.current = gesture;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let phase: 'idle' | 'pending' | 'active' = 'idle';
    let pendingCandidates: WebPanGesture[] = [];
    let rejected: Set<WebPanGesture> = new Set();
    let active: WebPanGesture | null = null;
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastT = 0;
    let velocityX = 0;
    let pointerId: number | null = null;

    const reset = () => {
      phase = 'idle';
      active = null;
      pendingCandidates = [];
      rejected = new Set();
      pointerId = null;
    };

    const onPointerDown = (e: PointerEvent) => {
      if (phase !== 'idle') return;
      const candidates = flattenGestures(gestureRef.current);
      const rect = el.getBoundingClientRect();
      const usable = candidates.filter(
        (g) => g._enabled && isWithinHitSlop(g._hitSlop, e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height)
      );
      if (usable.length === 0) return;
      phase = 'pending';
      pendingCandidates = usable;
      rejected = new Set();
      startX = e.clientX;
      startY = e.clientY;
      lastX = e.clientX;
      lastT = performance.now();
      velocityX = 0;
      pointerId = e.pointerId;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (phase === 'idle' || e.pointerId !== pointerId) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const now = performance.now();
      const dt = Math.max(1, now - lastT);
      velocityX = ((e.clientX - lastX) / dt) * 1000;
      lastX = e.clientX;
      lastT = now;

      if (phase === 'pending') {
        for (const g of pendingCandidates) {
          if (rejected.has(g)) continue;
          if (exceedsOffset(g._failOffsetY, dy)) {
            rejected.add(g);
            continue;
          }
          if (exceedsOffset(g._activeOffsetX, dx)) {
            active = g;
            phase = 'active';
            el.setPointerCapture?.(e.pointerId);
            g._onBegin?.({ x: startX, y: startY, translationX: 0, translationY: 0, velocityX: 0, velocityY: 0 });
            break;
          }
        }
      } else if (phase === 'active' && active) {
        active._onUpdate?.({ x: e.clientX, y: e.clientY, translationX: dx, translationY: dy, velocityX, velocityY: 0 });
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      if (phase === 'active' && active) {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        active._onEnd?.({ x: e.clientX, y: e.clientY, translationX: dx, translationY: dy, velocityX, velocityY: 0 });
      }
      reset();
    };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);
    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerUp);
    };
  }, []);

  return React.createElement('div', { ref, style: { display: 'contents' } }, children);
};

// Default export
export default {
  GestureHandlerRootView,
  PanGestureHandler,
  TapGestureHandler,
  LongPressGestureHandler,
  State,
  Directions,
  Swipeable,
  RectButton,
  BaseButton,
  BorderlessButton,
  ScrollView,
  FlatList,
  Gesture,
  GestureDetector,
};
