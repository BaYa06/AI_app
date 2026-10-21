/**
 * Стеклянные кнопки навигации (plan/new/liquid_glass.md, Glass 5).
 *
 * Слой навигации (ScreenHeader) включает контекст, и круглые кнопки-иконки внутри него
 * на iOS 26 становятся стеклянными. Те же кнопки в контенте остаются обычными.
 */
import { createContext } from 'react';

export const GlassControlsContext = createContext(false);
