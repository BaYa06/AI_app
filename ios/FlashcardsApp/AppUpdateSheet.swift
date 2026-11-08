//
//  AppUpdateSheet.swift
//  Нативная шторка «Вышла новая версия» (plan/new/app_update_prompt.md, шаг Update 3).
//
//  Тот же подход, что WhatsNewSheet.swift: лист показывает UISheetPresentationController,
//  содержимое на SwiftUI. Не RN Modal — он падал на iOS 26 (коммит a12afa6).
//  Swift ничего не решает: какое окно и когда — решает JS (src/services/appUpdate.ts).
//
//  JS → present({ variant: 'soft' | 'force', current, latest, colors, dark }) / dismiss().
//  Обратно — событие AppUpdateSheetEvent:
//  { type: 'update' } — «Обновить». Мягкое окно перед этим закрывается, обязательное остаётся:
//    человек вернётся из магазина, а окно на месте, пока версия не обновится.
//  { type: 'later' } — «Позже» (только мягкое).
//  { type: 'dismiss' } — мягкое закрыли свайпом вниз.
//

import SwiftUI
import UIKit

@objc(AppUpdateSheetModule)
class AppUpdateSheetModule: RCTEventEmitter, UISheetPresentationControllerDelegate {
  static let eventName = "AppUpdateSheetEvent"

  private var hasListeners = false
  private weak var presented: UIViewController?

  override static func requiresMainQueueSetup() -> Bool { false }

  override func supportedEvents() -> [String]! { [Self.eventName] }
  override func startObserving() { hasListeners = true }
  override func stopObserving() { hasListeners = false }

  private func emit(_ type: String) {
    guard hasListeners else { return }
    sendEvent(withName: Self.eventName, body: ["type": type])
  }

  @objc(present:)
  func present(_ options: NSDictionary) {
    DispatchQueue.main.async { self.presentSheet(options) }
  }

  @objc func dismiss() {
    DispatchQueue.main.async {
      guard let sheet = self.presented, sheet.presentingViewController != nil, !sheet.isBeingDismissed else { return }
      self.presented = nil
      sheet.dismiss(animated: true)
    }
  }

  private func presentSheet(_ options: NSDictionary) {
    guard presented == nil, let top = RCTPresentedViewController() else { return }

    let force = (options["variant"] as? String) == "force"
    let palette = AppUpdatePalette(options["colors"] as? NSDictionary ?? [:])
    let content = AppUpdateContent(
      force: force,
      current: options["current"] as? String ?? "",
      latest: options["latest"] as? String ?? ""
    )

    let actions = AppUpdateActions()
    let host = UIHostingController(rootView: AppUpdateSheetView(content: content, palette: palette, actions: actions))
    host.view.backgroundColor = palette.surface
    let style: UIUserInterfaceStyle = (options["dark"] as? Bool ?? false) ? .dark : .light
    host.overrideUserInterfaceStyle = style

    actions.onUpdate = { [weak self, weak host] in
      guard let self, let host, self.presented === host else { return }
      if force {
        self.emit("update")
      } else {
        self.presented = nil
        // Магазин открываем после закрытия листа, чтобы закрытие не дёргалось
        host.dismiss(animated: true) { self.emit("update") }
      }
    }
    actions.onLater = { [weak self, weak host] in
      guard let self, let host, self.presented === host else { return }
      self.presented = nil
      host.dismiss(animated: true) { self.emit("later") }
    }

    host.modalPresentationStyle = .pageSheet
    // Обязательное не закрыть ни свайпом, ни как-то ещё
    host.isModalInPresentation = force
    if let sheet = host.sheetPresentationController {
      if #available(iOS 16.0, *) {
        // Высота по содержимому (без прокрутки: ScrollView своей высоты не знает). При крупном
        // шрифте — не выше большого листа, дальше содержимое прокручивается
        let measure = UIHostingController(rootView: AppUpdateSheetBody(content: content, palette: palette, actions: actions))
        measure.overrideUserInterfaceStyle = style
        let width = top.view.bounds.width
        sheet.detents = [
          .custom { context in
            let fit = measure.sizeThatFits(in: CGSize(width: width, height: .greatestFiniteMagnitude)).height
            return min(ceil(fit), context.maximumDetentValue)
          },
        ]
      } else {
        sheet.detents = [.medium()]
      }
      sheet.prefersGrabberVisible = !force
      sheet.preferredCornerRadius = 24
      sheet.delegate = self
    }

    presented = host
    top.present(host, animated: true)
  }

  // Мягкое закрыли жестом (свайп вниз). Обязательное жестом не закрывается
  func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
    guard presentationController.presentedViewController === presented else { return }
    presented = nil
    emit("dismiss")
  }
}

// MARK: - Данные

struct AppUpdateContent {
  let force: Bool
  /// Версия на телефоне, например «1.8.1»
  let current: String
  /// Последняя в магазине; пусто — блок версий не показываем
  let latest: String

  var title: String { force ? "Нужно обновить Flashly" : "Вышла новая версия" }

  var text: String {
    force
      ? "Эта версия больше не работает. Обнови приложение, чтобы продолжить: наборы и прогресс сохранятся."
      : "Обнови Flashly: в новой версии исправления и новые возможности. Это займёт минуту."
  }
}

/// Токены темы из JS (useThemeColors, переданы через processColor)
struct AppUpdatePalette {
  let surface: UIColor
  let surfaceVariant: UIColor
  let textPrimary: UIColor
  let textSecondary: UIColor
  let textTertiary: UIColor
  let primary: UIColor
  let primaryFill: UIColor
  let onPrimary: UIColor

  init(_ dict: NSDictionary) {
    func color(_ key: String, _ fallback: UIColor) -> UIColor {
      guard let value = dict[key] else { return fallback }
      return RCTConvert.uiColor(value) ?? fallback
    }
    surface = color("surface", .systemBackground)
    surfaceVariant = color("surfaceVariant", .secondarySystemBackground)
    textPrimary = color("textPrimary", .label)
    textSecondary = color("textSecondary", .secondaryLabel)
    textTertiary = color("textTertiary", .tertiaryLabel)
    primary = color("primary", .systemIndigo)
    primaryFill = color("primaryFill", .systemIndigo)
    onPrimary = color("onPrimary", .white)
  }
}

// MARK: - Вид

/// Отступы, скругления, размеры — токены из src/constants/spacing.ts и брендбука
private enum Metrics {
  static let xxs: CGFloat = 4
  static let xs: CGFloat = 8
  static let s: CGFloat = 12
  static let m: CGFloat = 16
  static let l: CGFloat = 24
  static let xl: CGFloat = 32
  /// Кнопки — borderRadius.m
  static let radiusM: CGFloat = 12
  /// Вложенный блок — borderRadius.l
  static let radiusL: CGFloat = 16
  static let touch: CGFloat = 44
  static let button: CGFloat = 52
  static let iconCircle: CGFloat = 64
}

/// Колбэки кнопок: вид создаётся раньше, чем известен лист, которому они нужны
final class AppUpdateActions {
  var onUpdate: () -> Void = {}
  var onLater: () -> Void = {}
}

/// Лист: содержимое с прокруткой на случай крупного шрифта
struct AppUpdateSheetView: View {
  let content: AppUpdateContent
  let palette: AppUpdatePalette
  let actions: AppUpdateActions

  var body: some View {
    ScrollView(showsIndicators: false) {
      AppUpdateSheetBody(content: content, palette: palette, actions: actions)
    }
    .background(Color(palette.surface).ignoresSafeArea())
  }
}

/// Содержимое листа — по нему же меряется высота
struct AppUpdateSheetBody: View {
  let content: AppUpdateContent
  let palette: AppUpdatePalette
  let actions: AppUpdateActions

  private var p: AppUpdatePalette { palette }

  // Dynamic Type: размеры шкалы брендбука растут вместе с настройкой шрифта
  @ScaledMetric(relativeTo: .title3) private var titleSize: CGFloat = 20
  @ScaledMetric(relativeTo: .body) private var textSize: CGFloat = 16
  @ScaledMetric(relativeTo: .caption) private var captionSize: CGFloat = 12
  @ScaledMetric(relativeTo: .subheadline) private var labelSize: CGFloat = 14
  @ScaledMetric(relativeTo: .title2) private var iconSize: CGFloat = 32

  var body: some View {
    VStack(spacing: 0) {
      icon
        .padding(.bottom, Metrics.m)

      Text(content.title)
        .font(.system(size: titleSize, weight: .semibold))
        .foregroundColor(Color(p.textPrimary))
        .multilineTextAlignment(.center)
        .fixedSize(horizontal: false, vertical: true)
        .accessibilityAddTraits(.isHeader)
        .padding(.bottom, Metrics.xs)

      Text(content.text)
        .font(.system(size: textSize))
        .lineSpacing(textSize * 0.5 - 2)
        .foregroundColor(Color(p.textSecondary))
        .multilineTextAlignment(.center)
        .fixedSize(horizontal: false, vertical: true)

      if !content.latest.isEmpty {
        versions
          .padding(.top, Metrics.l)
      }

      buttons
        .padding(.top, Metrics.l)
    }
    .frame(maxWidth: .infinity)
    .padding(.horizontal, Metrics.l)
    // Без «ручки» (обязательное) сверху нужно чуть больше воздуха
    .padding(.top, content.force ? Metrics.xl : Metrics.l + Metrics.xs)
    .padding(.bottom, content.force ? Metrics.m : Metrics.xs)
  }

  private var icon: some View {
    Image(systemName: "arrow.down.circle")
      .font(.system(size: iconSize, weight: .regular))
      .foregroundColor(Color(p.primary))
      .frame(width: Metrics.iconCircle, height: Metrics.iconCircle)
      .background(Circle().fill(Color(p.primary).opacity(0.1)))
      .accessibilityHidden(true)
  }

  private var versions: some View {
    HStack(spacing: Metrics.m) {
      versionColumn(label: "Сейчас", value: content.current, accent: false)
      Image(systemName: "arrow.right")
        .font(.system(size: 16, weight: .semibold))
        .foregroundColor(Color(p.textTertiary))
      versionColumn(label: "Новая", value: content.latest, accent: true)
    }
    .frame(maxWidth: .infinity)
    .padding(Metrics.m)
    .background(RoundedRectangle(cornerRadius: Metrics.radiusL).fill(Color(p.surfaceVariant)))
    // VoiceOver: одна фраза вместо четырёх кусков
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(
      content.current.isEmpty
        ? "Новая версия \(content.latest)"
        : "Сейчас версия \(content.current), новая \(content.latest)"
    )
  }

  private func versionColumn(label: String, value: String, accent: Bool) -> some View {
    VStack(spacing: Metrics.xxs) {
      Text(label)
        .font(.system(size: captionSize))
        .foregroundColor(Color(p.textSecondary))
      Text(value.isEmpty ? "—" : value)
        .font(.system(size: titleSize, weight: .semibold).monospacedDigit())
        .foregroundColor(Color(accent ? p.primary : p.textPrimary))
    }
    .frame(maxWidth: .infinity)
  }

  private var buttons: some View {
    VStack(spacing: Metrics.xs) {
      Button { actions.onUpdate() } label: {
        Text("Обновить")
          .font(.system(size: textSize, weight: .semibold))
          .foregroundColor(Color(p.onPrimary))
          .frame(maxWidth: .infinity, minHeight: Metrics.button)
          .background(RoundedRectangle(cornerRadius: Metrics.radiusM).fill(Color(p.primaryFill)))
      }
      .buttonStyle(AppUpdatePressableStyle(scale: true))

      if !content.force {
        Button { actions.onLater() } label: {
          Text("Позже")
            .font(.system(size: labelSize, weight: .semibold))
            .foregroundColor(Color(p.textSecondary))
            .frame(maxWidth: .infinity, minHeight: Metrics.touch)
            .contentShape(Rectangle())
        }
        .buttonStyle(AppUpdatePressableStyle(scale: false))
      }
    }
  }
}

/// Нажатие — прозрачность 0.85; главной кнопке ещё масштаб 0.98 (брендбук 7.1)
private struct AppUpdatePressableStyle: ButtonStyle {
  let scale: Bool

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .opacity(configuration.isPressed ? 0.85 : 1)
      .scaleEffect(scale && configuration.isPressed ? 0.98 : 1)
  }
}

#if DEBUG
struct AppUpdateSheetView_Previews: PreviewProvider {
  static var previews: some View {
    let palette = AppUpdatePalette([:])
    Group {
      AppUpdateSheetView(content: AppUpdateContent(force: false, current: "1.8.1", latest: "1.9.0"), palette: palette, actions: AppUpdateActions())
        .previewDisplayName("Мягкое")
      AppUpdateSheetView(content: AppUpdateContent(force: true, current: "1.8.1", latest: "1.9.0"), palette: palette, actions: AppUpdateActions())
        .preferredColorScheme(.dark)
        .previewDisplayName("Обязательное, тёмная")
    }
    .previewLayout(.fixed(width: 390, height: 520))
  }
}
#endif
