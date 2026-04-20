# Flashly — Animation Specification

## 1. Screen Transitions

### Forward navigation (push)
Используется при переходе на: **SetDetail**, **Study**, **Results**

```css
@keyframes slideInRight {
  from { opacity: 0; transform: translateX(100%); }
  to   { opacity: 1; transform: translateX(0); }
}
duration: 280ms
easing: cubic-bezier(0.32, 0.72, 0, 1)
```

### Back navigation (pop)
Используется при нажатии Back из SetDetail/Study/Results

```css
@keyframes slideInLeft {
  from { opacity: 0; transform: translateX(-28%); }
  to   { opacity: 1; transform: translateX(0); }
}
duration: 240ms
easing: cubic-bezier(0.32, 0.72, 0, 1)
```

### Tab switch (cross-fade)
Используется при переключении Home / Library / Profile

```css
@keyframes crossFadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
duration: 180ms
easing: ease
```

---

## 2. Tab Bar — Icon Micro-bounce

При нажатии на таб иконка делает упругий bounce.

```css
@keyframes tabBounce {
  0%   { transform: scale(1); }
  40%  { transform: scale(1.35); }
  70%  { transform: scale(0.88); }
  100% { transform: scale(1); }
}
duration: 350ms
easing: cubic-bezier(0.34, 1.56, 0.64, 1)
trigger: onClick на таб
```

---

## 3. Home Screen — Set Cards Stagger

Карточки наборов появляются последовательно одна за другой.

```css
@keyframes staggerIn {
  from { opacity: 0; transform: translateY(14px); }
  to   { opacity: 1; transform: translateY(0); }
}
duration: 300ms
easing: ease
delay: index * 70ms  /* каждая карточка на 70ms позже предыдущей */
trigger: при появлении Home экрана
```

---

## 4. Progress Bar — Animated Fill

Используется на: **Home Screen** (прогресс набора), **Results Screen** (итоговый прогресс).

```css
@keyframes progressGrow {
  from { transform: scaleX(0); }
  to   { transform: scaleX(var(--progress)); }  /* 0.0 → 1.0, container = full width */
}
transform-origin: left center
duration: 700ms
easing: cubic-bezier(0.34, 1.1, 0.64, 1)  /* лёгкий overshoot */
trigger: при mount компонента
```

> ⚡ `scaleX` вместо `width` — GPU-анимация, не вызывает layout reflow. Визуально идентично.

---

skipp

---

## 6. Study Screen — Card Stack Effect

За активной карточкой видны 2 следующие — создаётся эффект колоды.

```
Карточка +2 (самая дальняя):
  transform: translateY(10px) scale(0.92)
  opacity: 0.40

Карточка +1:
  transform: translateY(5px) scale(0.96)
  opacity: 0.65

Активная карточка:
  z-index: 2
  без трансформации
```

При переходе к следующей карточке: активная исчезает, +1 становится активной.

---

skip

---

## 8. Bottom Sheet — Spring Up

Study Mode Sheet появляется снизу с пружинным эффектом.

```css
@keyframes sheetUp {
  from { transform: translateY(100%); }
  to   { transform: translateY(0); }
}
duration: 380ms
easing: cubic-bezier(0.34, 1.4, 0.64, 1)  /* spring overshoot */
trigger: при открытии sheet
```

Фон (overlay) появляется отдельно:
```css
animation: crossFadeIn 200ms ease both
```

---

## Summary Table

| Анимация | Экран | Duration | Easing |
|---|---|---|---|
| Slide In Right | SetDetail, Study, Results | 280ms | cubic-bezier(0.32,0.72,0,1) |
| Slide In Left (back) | Home, SetDetail | 240ms | cubic-bezier(0.32,0.72,0,1) |
| Cross-fade | Tab switch | 180ms | ease |
| Tab bounce | Tab bar | 350ms | cubic-bezier(0.34,1.56,0.64,1) |
| Stagger cards | Home | 300ms + 70ms×i | ease |
| Progress fill | Home, Results | 700ms | cubic-bezier(0.34,1.1,0.64,1) |
| Card stack | Study | static | — |
| Sheet spring | SetDetail | 380ms | cubic-bezier(0.34,1.4,0.64,1) |
