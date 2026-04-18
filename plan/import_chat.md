# Фича: "Создать карточки из файлов" (Flashly)

Добавляем возможность загрузить файлы (фото с камеры, PDF, CSV, TSV) и получить готовые флэш-карточки через Gemini AI.

## Стек проекта

- React Native (Expo) + TypeScript
- Навигация: React Navigation (Stack + Bottom Tabs), типы в `RootStackParamList`
- Стейт: Zustand — `useSetsStore`, `useSettingsStore`, `useCardsStore`, `useAuthStore`
- Темы: `useThemeColors()` → `{ primary, background, surface, textPrimary, textSecondary, border, ... }`
- Иконки: `lucide-react-native`
- Primary цвет: `#6366F1`, поддержка светлой/тёмной темы обязательна
- AI бэкенд: Node.js (Express) на GCP `34.9.20.41:3001`
- Vercel проксирует `/ai/*` → GCP, **но файловые запросы слать напрямую на GCP** (Vercel ограничивает тело до ~4.5 МБ и имеет timeout 10–30 сек)
- Уже есть: `api/extract-image.js`, `api/extract-pdf.js` с `@google-cloud/vertexai`, модель `gemini-2.0-flash-001`
- Уже установлены: `expo-document-picker`, `expo-image-picker`, `expo-image-manipulator`, `expo-file-system`

## Поддерживаемые типы файлов

| Тип | MIME | Транспорт |
|-----|------|-----------|
| Фото с камеры | `image/jpeg`, `image/png` | base64 (после сжатия) |
| PDF | `application/pdf` | base64 |
| CSV | `text/csv` | plain text (UTF-8) |
| TSV | `text/tab-separated-values` | plain text (UTF-8) |

Лимиты: максимум **5 файлов**, суммарно до **20 МБ** (до сжатия). CSV/TSV — предупреждение если файл > 500 КБ.

---

## Шаг 1 — Бэкенд: `import-files.js` на GCP сервере

**Файл:** добавить `import-files.js` рядом с `extract-image.js` и подключить в `app.js`:
```js
import { importFilesHandler } from './import-files.js';
app.post('/import-files', importFilesHandler);
```

**Убедиться в `app.js`:**
```js
app.use(express.json({ limit: '50mb' }));
```

**Код `import-files.js`:**

```javascript
import { VertexAI } from '@google-cloud/vertexai';

export async function importFilesHandler(req, res) {
  const { files, prompt, userId } = req.body;

  // Валидация
  if (!files || !Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ error: 'files array is required' });
  }
  if (files.length > 5) {
    return res.status(400).json({ error: 'Maximum 5 files allowed' });
  }

  const ALLOWED_TYPES = [
    'image/jpeg',
    'image/png',
    'application/pdf',
    'text/csv',
    'text/tab-separated-values',
  ];

  for (const file of files) {
    if (!ALLOWED_TYPES.includes(file.mimeType)) {
      return res.status(400).json({ error: `Unsupported file type: ${file.mimeType}` });
    }
    // text-файлы приходят как { type:'text', content:string, mimeType, name }
    // бинарные — как { type:'binary', base64:string, mimeType, name }
    if (file.type === 'binary' && !file.base64) {
      return res.status(400).json({ error: `Missing base64 for file: ${file.name}` });
    }
    if (file.type === 'text' && typeof file.content !== 'string') {
      return res.status(400).json({ error: `Missing content for file: ${file.name}` });
    }
  }

  // Проверка суммарного размера base64
  const totalBase64Size = files
    .filter(f => f.type === 'binary')
    .reduce((sum, f) => sum + (f.base64?.length || 0), 0);
  if (totalBase64Size > 28_000_000) {
    return res.status(400).json({ error: 'Total file size too large. Maximum 20MB.' });
  }

  try {
    const saKey = process.env.VERTEX_SA_KEY;
    const project = process.env.GOOGLE_CLOUD_PROJECT_ID || 'flashly-485417';
    const location = process.env.VERTEX_AI_LOCATION || 'us-central1';
    const credentials = JSON.parse(saKey);

    const vertexAI = new VertexAI({ project, location, googleAuthOptions: { credentials } });
    const model = process.env.VERTEX_AI_MODEL || 'gemini-2.0-flash-001';

    const generativeModel = vertexAI.getGenerativeModel({
      model,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
      },
    });

    const systemPrompt = `You are a flashcard generator. The user uploads files (images, PDFs, CSV, TSV tables) and tells you what to extract.
Always return a JSON object: { "title": "short suggested title in user language", "cards": [{"front": "...", "back": "..."}] }
Rules:
- Return ONLY the JSON object, nothing else
- front: the word, term, question, or concept
- back: the definition, answer, or translation
- title: 2–5 words summarising the content, in the same language as the cards
- Extract as many relevant cards as possible from all provided files
- For CSV/TSV: use column headers as context to decide what is front and back
- If no clear pairs found, create question-answer cards from the content`;

    const userPrompt = prompt || 'Extract all terms and create flashcards from these files.';

    // Строим parts: бинарные файлы как inlineData, текстовые как text
    const parts = [
      ...files.map(f => {
        if (f.type === 'binary') {
          return { inlineData: { mimeType: f.mimeType, data: f.base64 } };
        } else {
          // CSV/TSV — передаём как текст с пояснением
          return { text: `[File: ${f.name} (${f.mimeType})]\n${f.content}` };
        }
      }),
      { text: userPrompt },
    ];

    const result = await generativeModel.generateContent({
      contents: [{ role: 'user', parts }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
    });

    const responseText = result.response.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

    let parsed;
    try {
      parsed = JSON.parse(responseText);
    } catch {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    }

    const cards = Array.isArray(parsed.cards)
      ? parsed.cards.filter(
          c => c && typeof c.front === 'string' && typeof c.back === 'string' && c.front.trim() && c.back.trim()
        )
      : [];

    const suggestedTitle = typeof parsed.title === 'string' ? parsed.title.trim() : '';

    return res.status(200).json({ cards, suggestedTitle, count: cards.length });

  } catch (error) {
    console.error('[import-files] error:', error?.message || error);
    return res.status(500).json({ error: 'Failed to generate cards: ' + (error?.message || 'Unknown error') });
  }
}
```

---

## Шаг 2 — Типы навигации и регистрация экранов

**Файл:** `src/navigation/types.ts` (или где объявлен `RootStackParamList`) — добавить:
```typescript
ImportFiles: undefined;
PreviewImport: {
  cards: Array<{ front: string; back: string }>;
  suggestedTitle?: string;
};
```

**Файл:** основной Stack-навигатор (обычно `src/navigation/AppNavigator.tsx` или `RootNavigator.tsx`) — добавить два экрана:
```tsx
import ImportFilesScreen from '../screens/ImportFilesScreen';
import PreviewImportScreen from '../screens/PreviewImportScreen';

// Внутри Stack.Navigator:
<Stack.Screen name="ImportFiles" component={ImportFilesScreen} options={{ headerShown: false }} />
<Stack.Screen name="PreviewImport" component={PreviewImportScreen} options={{ headerShown: false }} />
```

---

## Шаг 3 — Экран `ImportFilesScreen.tsx`

**Файл:** `src/screens/ImportFilesScreen.tsx`

### Структура файла

```
ImportFilesScreen
├── хелпер compressImage(uri) → { base64, mimeType }
├── хелпер readTextFile(uri) → string
├── хелпер pickFromCamera()
├── хелпер pickFromGallery()
├── хелпер pickDocument()
├── хелпер handleAddFiles()  ← показывает ActionSheet
├── хелпер buildFilesPayload() → массив для отправки на сервер
├── handleSubmit() ← вызывает POST /import-files напрямую на GCP
└── UI
```

### Типы

```typescript
type AttachedFile = {
  id: string;            // Math.random().toString(36)
  name: string;
  uri: string;
  mimeType: string;
  fileType: 'image' | 'pdf' | 'text'; // 'text' для csv/tsv
  sizeBytes: number;
  base64?: string;       // для image/pdf — заполняется после compressImage/readFile
  textContent?: string;  // для csv/tsv
};
```

### Хелперы

```typescript
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { ActionSheetIOS, Platform, Alert } from 'react-native';

const MAX_FILES = 5;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024; // 20 MB
const CSV_WARN_BYTES = 500 * 1024; // 500 KB

async function compressImage(uri: string): Promise<{ base64: string; mimeType: 'image/jpeg' }> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1024 } }],
    { compress: 0.65, format: ImageManipulator.SaveFormat.JPEG, base64: true }
  );
  return { base64: result.base64!, mimeType: 'image/jpeg' };
}

async function readTextFile(uri: string): Promise<string> {
  return await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });
}

async function readPdfAsBase64(uri: string): Promise<string> {
  return await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
}
```

### ActionSheet (кросс-платформенный)

```typescript
// Если в проекте нет @expo/react-native-action-sheet — использовать Alert с кнопками:
function showAddSheet(onPick: (source: 'camera' | 'gallery' | 'document') => void) {
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      { options: ['Отмена', 'Сделать фото', 'Фото из галереи', 'Файл (PDF, CSV, TSV)'], cancelButtonIndex: 0 },
      (i) => {
        if (i === 1) onPick('camera');
        if (i === 2) onPick('gallery');
        if (i === 3) onPick('document');
      }
    );
  } else {
    Alert.alert('Добавить файл', undefined, [
      { text: 'Сделать фото', onPress: () => onPick('camera') },
      { text: 'Фото из галереи', onPress: () => onPick('gallery') },
      { text: 'Файл (PDF, CSV, TSV)', onPress: () => onPick('document') },
      { text: 'Отмена', style: 'cancel' },
    ]);
  }
}
```

### Выбор документов

```typescript
async function pickDocument(): Promise<AttachedFile[]> {
  const result = await DocumentPicker.getDocumentAsync({
    type: '*/*', // широкий тип, фильтруем вручную
    multiple: true,
    copyToCacheDirectory: true,
  });
  if (result.canceled) return [];

  const ALLOWED_EXTS = ['.pdf', '.csv', '.tsv'];
  const MIME_MAP: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.csv': 'text/csv',
    '.tsv': 'text/tab-separated-values',
  };

  return result.assets
    .filter(a => ALLOWED_EXTS.some(ext => a.name.toLowerCase().endsWith(ext)))
    .map(a => {
      const ext = ALLOWED_EXTS.find(e => a.name.toLowerCase().endsWith(e))!;
      const mimeType = a.mimeType || MIME_MAP[ext];
      return {
        id: Math.random().toString(36).slice(2),
        name: a.name,
        uri: a.uri,
        mimeType,
        fileType: ext === '.pdf' ? 'pdf' : 'text',
        sizeBytes: a.size || 0,
      };
    });
}
```

### Валидация при добавлении файла

```typescript
// Перед добавлением файлов в стейт проверять:
// 1. files.length + newFiles.length <= MAX_FILES
// 2. totalBytes + newBytes <= MAX_TOTAL_BYTES
// 3. Для text-файлов > CSV_WARN_BYTES — показать Alert с предупреждением, но не блокировать
```

### Подготовка payload перед отправкой

```typescript
async function buildPayload(files: AttachedFile[]) {
  return Promise.all(files.map(async f => {
    if (f.fileType === 'image') {
      const { base64, mimeType } = await compressImage(f.uri);
      return { type: 'binary', name: f.name, mimeType, base64 };
    }
    if (f.fileType === 'pdf') {
      const base64 = await readPdfAsBase64(f.uri);
      return { type: 'binary', name: f.name, mimeType: 'application/pdf', base64 };
    }
    // csv / tsv
    const content = await readTextFile(f.uri);
    return { type: 'text', name: f.name, mimeType: f.mimeType, content };
  }));
}
```

### Отправка — напрямую на GCP (не через Vercel)

```typescript
const GCP_BASE = 'http://34.9.20.41:3001'; // Vercel не используем для файлов

async function handleSubmit() {
  setLoading(true);
  try {
    const payload = await buildPayload(files);
    const response = await fetch(`${GCP_BASE}/import-files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: payload, prompt, userId }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Server error');
    navigation.navigate('PreviewImport', { cards: data.cards, suggestedTitle: data.suggestedTitle });
  } catch (e: any) {
    Alert.alert('Ошибка', e.message || 'Не удалось создать карточки');
  } finally {
    setLoading(false);
  }
}
```

### UI структура (JSX)

```
<SafeAreaView>
  <ScrollView>
    {/* Хедер */}
    <View row>
      <TouchableOpacity onPress={() => navigation.goBack()}>
        <ChevronLeft />
      </TouchableOpacity>
      <Text>"Создать из файлов"</Text>
      <View badge><Text>"AI"</Text></View>
    </View>

    {/* Секция файлов */}
    <Text>"Файлы"</Text>
    {/* Чипы прикреплённых файлов */}
    {files.map(f => <FileChip key={f.id} file={f} onRemove={removeFile} />)}
    {/* Кнопка добавить */}
    {files.length < MAX_FILES && (
      <TouchableOpacity onPress={handleAddFiles} style={dashedBorder}>
        <Upload /> <Text>"+ Добавить"</Text>
      </TouchableOpacity>
    )}
    {/* Drop-зона (декоративная, тот же onPress) */}
    <TouchableOpacity onPress={handleAddFiles}>
      <Upload /><Text>"Загрузить файлы"</Text>
      <Text secondary>"JPG, PNG, PDF, CSV, TSV"</Text>
    </TouchableOpacity>

    {/* Секция "Что сделать" */}
    <Text>"Что сделать"</Text>
    <TextInput multiline minHeight={80} value={prompt} onChangeText={setPrompt}
      placeholder="Опишите что нужно сделать..." />
    {/* Быстрые варианты */}
    <ScrollView horizontal>
      {QUICK_PROMPTS.map(p => <Chip key={p} onPress={() => setPrompt(p)}>{p}</Chip>)}
    </ScrollView>
  </ScrollView>

  {/* Нижняя панель — fixed */}
  <View bottomPanel>
    <View row>
      <Text secondary>"{files.length} файлов · {totalMB} МБ"</Text>
      <Text secondary>"1 запрос к AI"</Text>
    </View>
    <TouchableOpacity
      disabled={files.length === 0 || loading}
      onPress={handleSubmit}
    >
      {loading
        ? <><ActivityIndicator /><Text>"AI обрабатывает..."</Text></>
        : <><Sparkles /><Text>"Создать карточки"</Text></>
      }
    </TouchableOpacity>
  </View>
</SafeAreaView>
```

**Быстрые варианты (`QUICK_PROMPTS`):**
```typescript
const QUICK_PROMPTS = [
  'Все слова → карточки',
  'Только термины',
  'Вопрос-ответ',
  'Даты и события',
  'Перевести слова',
];
```

**FileChip — иконки по типу файла:**
- `image` → зелёный фон, иконка `Image`
- `pdf` → оранжевый фон, иконка `FileText`
- `text` (csv/tsv) → синий фон, иконка `Table`

---

## Шаг 4 — Экран `PreviewImportScreen.tsx`

**Файл:** `src/screens/PreviewImportScreen.tsx`

**Параметры:** `{ cards: Array<{front: string, back: string}>, suggestedTitle?: string }`

**UI:**
```
Хедер: "← Предпросмотр" + "[N карточек]"

FlatList карточек:
  Каждая карточка — surface-контейнер с двумя строками:
  [front] — textPrimary, bold
  [back]  — textSecondary

Нижняя панель:
  Кнопка "Изменить" (secondary) → navigation.goBack()
  Кнопка "Сохранить набор" (primary) → Alert.prompt или Modal с полем названия
    - По умолчанию prefill: suggestedTitle || ''
    - После ввода → apiService.createSet({ title }) → затем Promise.all(cards.map(c => apiService.createCard(...)))
    - После сохранения → navigation.popToTop() или navigate('Home')
```

**Логика сохранения:**
```typescript
async function handleSave(title: string) {
  setSaving(true);
  try {
    const set = await apiService.createSet({ title: title.trim() || 'Импорт' });
    await Promise.all(
      cards.map(c => apiService.createCard({ setId: set.id, front: c.front, back: c.back }))
    );
    navigation.popToTop();
  } catch (e: any) {
    Alert.alert('Ошибка', e.message);
  } finally {
    setSaving(false);
  }
}
```

---

## Шаг 5 — Точка входа с HomeScreen

**Файл:** `src/screens/HomeScreen.tsx` (или где находится кнопка "Импорт")

Найти существующую кнопку/иконку Upload или добавить новую кнопку в меню:
```typescript
<TouchableOpacity onPress={() => navigation.navigate('ImportFiles')}>
  <Upload size={20} color={colors.primary} />
  <Text>Импорт</Text>
</TouchableOpacity>
```

---

## Порядок реализации

| Шаг | Файл(ы) | Зависимости |
|-----|---------|-------------|
| 1 | `import-files.js` (GCP сервер) | независимо |
| 2 | `src/navigation/types.ts` + навигатор | независимо |
| 3 | `src/screens/ImportFilesScreen.tsx` | нужны шаги 1 и 2 |
| 4 | `src/screens/PreviewImportScreen.tsx` | нужен шаг 2 |
| 5 | `src/screens/HomeScreen.tsx` | нужны шаги 2, 3, 4 |

## Что НЕ нужно делать

- Не менять `HomeScreen` кроме добавления кнопки-входа
- Не трогать существующие `api/extract-image.js`, `api/extract-pdf.js`
- Не устанавливать новые npm-пакеты — всё нужное уже есть
- Не слать файловые запросы через Vercel — только напрямую на GCP `34.9.20.41:3001`
