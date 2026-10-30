/**
 * AddByLinkSheet — «Добавить набор по ссылке» (plan/new/share_set.md, Share 5).
 * Запасной путь, когда ссылка не открыла приложение: установил его из App Store после перехода
 * по ссылке, ссылка пришла на компьютер, открылась во встроенном браузере Instagram.
 *
 * Буфер читаем только по нажатию «Вставить»: iOS спрашивает «Разрешить вставку?» при каждом
 * чтении из кода, поэтому не делаем этого при открытии листа. Вставить вручную (долгое нажатие
 * на поле → «Вставить») можно без вопроса.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Clipboard, Platform, StyleSheet, View } from 'react-native';
import { ClipboardPaste, Link2 } from 'lucide-react-native';
import { Button, Sheet, TextField } from '@/components/ui';
import { spacing } from '@/constants';
import { findShareCode } from '@/services/shareLinks';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Код найден — главная закрывает лист и открывает превью набора. */
  onCode: (code: string) => void;
}

async function readClipboard(): Promise<string> {
  if (Platform.OS === 'web') {
    try {
      return await navigator.clipboard.readText();
    } catch {
      return '';
    }
  }
  return Clipboard.getString();
}

export function AddByLinkSheet({ visible, onClose, onCode }: Props) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setText('');
    setError(null);
  }, [visible]);

  const submit = useCallback((value: string) => {
    const code = findShareCode(value);
    if (!code) {
      setError('Это не ссылка на набор Flashly');
      return;
    }
    onCode(code);
  }, [onCode]);

  const handlePaste = useCallback(async () => {
    const value = (await readClipboard()).trim();
    if (!value) {
      setError('Буфер пуст — скопируй ссылку из сообщения');
      return;
    }
    setText(value);
    const code = findShareCode(value);
    if (code) onCode(code);
    else setError('В буфере нет ссылки на набор Flashly');
  }, [onCode]);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      dismissOnBackdrop={false}
      title="Набор по ссылке"
      footer={
        <View style={styles.actions}>
          <Button
            variant="secondary"
            title="Вставить"
            icon={ClipboardPaste}
            onPress={handlePaste}
            style={styles.flex1}
          />
          <Button
            title="Открыть"
            onPress={() => submit(text)}
            disabled={!text.trim()}
            style={styles.flex1}
          />
        </View>
      }
    >
      <TextField
        icon={Link2}
        value={text}
        onChangeText={(value) => {
          setText(value);
          if (error) setError(null);
        }}
        onSubmitEditing={() => submit(text)}
        placeholder="https://…/s/…"
        hint="Вставь ссылку, которую тебе прислали"
        error={error}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        returnKeyType="go"
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    gap: spacing.s,
  },
  flex1: {
    flex: 1,
  },
});
