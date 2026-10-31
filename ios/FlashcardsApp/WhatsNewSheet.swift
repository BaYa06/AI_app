//
//  WhatsNewSheet.swift
//  Нативная шторка «Что нового» (plan/new/whats_new.md, шаг News 2).
//
//  Тот же подход, что StudyModeSheet.swift: лист показывает UISheetPresentationController,
//  содержимое на SwiftUI — свайп между страницами, свайп вниз и анимации делает система.
//  Swift ничего не решает: какие новости и в каком порядке — решает JS (src/services/whatsNew.ts)
//  и передаёт готовые страницы.
//
//  JS → present(options) / dismiss(). Обратно — событие WhatsNewSheetEvent:
//  { type: 'page', index } — открыта страница (и первая при показе),
//  { type: 'try', index } — «Попробовать» (приходит после закрытия листа),
//  { type: 'close', index } — крестик, «Понятно» или жест.
//

import SwiftUI
import UIKit

@objc(WhatsNewSheetModule)
class WhatsNewSheetModule: RCTEventEmitter, UISheetPresentationControllerDelegate {
  static let eventName = "WhatsNewSheetEvent"

  private var hasListeners = false
  private weak var presented: UIViewController?
  private var model: WhatsNewSheetModel?

  override static func requiresMainQueueSetup() -> Bool { false }

  override func supportedEvents() -> [String]! { [Self.eventName] }
  override func startObserving() { hasListeners = true }
  override func stopObserving() { hasListeners = false }

  private func emit(_ body: [String: Any]) {
    guard hasListeners else { return }
    sendEvent(withName: Self.eventName, body: body)
  }

  @objc(present:)
  func present(_ options: NSDictionary) {
    DispatchQueue.main.async { self.presentSheet(options) }
  }

  @objc func dismiss() {
    DispatchQueue.main.async {
      guard let sheet = self.presented, sheet.presentingViewController != nil, !sheet.isBeingDismissed else { return }
      self.presented = nil
      self.model = nil
      sheet.dismiss(animated: true)
    }
  }

  private func presentSheet(_ options: NSDictionary) {
    guard presented == nil, let top = RCTPresentedViewController() else { return }

    let pages = (options["pages"] as? [NSDictionary] ?? []).enumerated().map { WhatsNewPage($1, index: $0) }
    guard !pages.isEmpty else { return }

    let palette = WhatsNewPalette(options["colors"] as? NSDictionary ?? [:])
    let model = WhatsNewSheetModel(
      version: options["version"] as? String ?? "",
      pages: pages,
      palette: palette
    )

    let host = UIHostingController(rootView: WhatsNewSheetView(model: model))
    host.view.backgroundColor = palette.surface
    host.overrideUserInterfaceStyle = (options["dark"] as? Bool ?? false) ? .dark : .light

    model.onPage = { [weak self] index in self?.emit(["type": "page", "index": index]) }
    model.onClose = { [weak self, weak host] index in
      guard let self, let host, self.presented === host else { return }
      self.presented = nil
      self.model = nil
      host.dismiss(animated: true) { self.emit(["type": "close", "index": index]) }
    }
    model.onTry = { [weak self, weak host] index in
      guard let self, let host, self.presented === host else { return }
      self.presented = nil
      self.model = nil
      // Переход на экран — после закрытия листа, чтобы закрытие не дёргалось
      host.dismiss(animated: true) { self.emit(["type": "try", "index": index]) }
    }

    host.modalPresentationStyle = .pageSheet
    if let sheet = host.sheetPresentationController {
      sheet.detents = [.large()]
      sheet.prefersGrabberVisible = true
      sheet.preferredCornerRadius = 24
      sheet.delegate = self
    }

    presented = host
    self.model = model
    top.present(host, animated: true) { model.onPage(0) }
  }

  // Закрыли жестом (свайп вниз)
  func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
    guard presentationController.presentedViewController === presented else { return }
    let index = model?.index ?? 0
    presented = nil
    model = nil
    emit(["type": "close", "index": index])
  }
}

// MARK: - Данные

struct WhatsNewPage: Identifiable {
  let id: Int
  let tag: String
  let title: String
  let text: String
  /// nil — страница без картинки (в том числе незнакомая сборке иллюстрация)
  let art: String?
  let actionLabel: String?
  /// Страница «И ещё» — заголовки остальных новостей
  let items: [String]

  init(_ dict: NSDictionary, index: Int) {
    id = index
    tag = dict["tag"] as? String ?? ""
    title = dict["title"] as? String ?? ""
    text = dict["text"] as? String ?? ""
    art = dict["art"] as? String
    actionLabel = dict["actionLabel"] as? String
    items = dict["items"] as? [String] ?? []
  }
}

/// Токены темы из JS (useThemeColors, переданы через processColor)
struct WhatsNewPalette {
  let surface: UIColor
  let surfaceMuted: UIColor
  let surfaceVariant: UIColor
  let border: UIColor
  let textPrimary: UIColor
  let textSecondary: UIColor
  let textTertiary: UIColor
  let primary: UIColor
  let primaryFill: UIColor
  let onPrimary: UIColor
  let error: UIColor
  let errorText: UIColor
  let warningText: UIColor
  let success: UIColor
  let successText: UIColor
  let streak: UIColor
  let like: UIColor
  let gameViolet: UIColor
  let gameRose: UIColor
  let gameTeal: UIColor
  let gameGreen: UIColor

  init(_ dict: NSDictionary) {
    func color(_ key: String, _ fallback: UIColor) -> UIColor {
      guard let value = dict[key] else { return fallback }
      return RCTConvert.uiColor(value) ?? fallback
    }
    surface = color("surface", .systemBackground)
    surfaceMuted = color("surfaceMuted", .secondarySystemBackground)
    surfaceVariant = color("surfaceVariant", .tertiarySystemBackground)
    border = color("border", .separator)
    textPrimary = color("textPrimary", .label)
    textSecondary = color("textSecondary", .secondaryLabel)
    textTertiary = color("textTertiary", .tertiaryLabel)
    primary = color("primary", .systemIndigo)
    primaryFill = color("primaryFill", .systemIndigo)
    onPrimary = color("onPrimary", .white)
    error = color("error", .systemRed)
    errorText = color("errorText", .systemRed)
    warningText = color("warningText", .systemOrange)
    success = color("success", .systemGreen)
    successText = color("successText", .systemGreen)
    streak = color("streak", .systemOrange)
    like = color("like", .systemPink)
    gameViolet = color("gameViolet", .systemPurple)
    gameRose = color("gameRose", .systemPink)
    gameTeal = color("gameTeal", .systemTeal)
    gameGreen = color("gameGreen", .systemGreen)
  }
}

final class WhatsNewSheetModel: ObservableObject {
  let version: String
  let pages: [WhatsNewPage]
  let palette: WhatsNewPalette
  @Published var index = 0

  var onPage: (Int) -> Void = { _ in }
  var onTry: (Int) -> Void = { _ in }
  var onClose: (Int) -> Void = { _ in }

  init(version: String, pages: [WhatsNewPage], palette: WhatsNewPalette) {
    self.version = version
    self.pages = pages
    self.palette = palette
  }

  var isLast: Bool { index >= pages.count - 1 }

  func next() {
    if isLast { onClose(index) } else { index += 1 }
  }
}

// MARK: - Вид

/// Отступы и скругления — токены из src/constants/spacing.ts
private enum Metrics {
  static let xxs: CGFloat = 4
  static let xs: CGFloat = 8
  static let s: CGFloat = 12
  static let m: CGFloat = 16
  static let l: CGFloat = 24
  static let radiusM: CGFloat = 12
  static let radiusL: CGFloat = 16
  static let radiusXL: CGFloat = 24
  static let touch: CGFloat = 44
  static let button: CGFloat = 52
  static let art: CGFloat = 228
}

struct WhatsNewSheetView: View {
  @ObservedObject var model: WhatsNewSheetModel
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  private var p: WhatsNewPalette { model.palette }

  var body: some View {
    VStack(spacing: 0) {
      header
      TabView(selection: $model.index) {
        ForEach(model.pages) { page in
          WhatsNewPageView(page: page, palette: p) { model.onTry(page.id) }
            .tag(page.id)
        }
      }
      .tabViewStyle(.page(indexDisplayMode: .never))
      .onChange(of: model.index) { index in
        UISelectionFeedbackGenerator().selectionChanged()
        model.onPage(index)
      }
      footer
    }
    .background(Color(p.surface).ignoresSafeArea())
  }

  private var header: some View {
    HStack(spacing: Metrics.s) {
      Text(model.version.isEmpty ? "ЧТО НОВОГО" : "ЧТО НОВОГО · \(model.version)")
        .font(.system(size: 12, weight: .semibold))
        .kerning(0.8)
        .foregroundColor(Color(p.textSecondary))
        .accessibilityAddTraits(.isHeader)
      Spacer(minLength: 0)
      Button { model.onClose(model.index) } label: {
        Image(systemName: "xmark")
          .font(.system(size: 14, weight: .semibold))
          .foregroundColor(Color(p.textSecondary))
          .frame(width: 32, height: 32)
          .background(Circle().fill(Color(p.surfaceMuted)))
          .frame(width: Metrics.touch, height: Metrics.touch)
          .contentShape(Rectangle())
      }
      .accessibilityLabel("Закрыть")
    }
    .padding(.leading, Metrics.l)
    .padding(.trailing, Metrics.xs)
    .padding(.top, Metrics.l)
  }

  private var footer: some View {
    VStack(spacing: Metrics.m) {
      if model.pages.count > 1 {
        HStack(spacing: 6) {
          ForEach(model.pages) { page in
            Capsule()
              .fill(Color(page.id == model.index ? p.primary : p.border))
              .frame(width: page.id == model.index ? 22 : 8, height: 8)
          }
        }
        .animation(reduceMotion ? nil : .easeOut(duration: 0.25), value: model.index)
        // VoiceOver: «Страница 2 из 4», свайп вверх/вниз листает
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Страница \(model.index + 1) из \(model.pages.count)")
        .accessibilityAdjustableAction { direction in
          switch direction {
          case .increment: if !model.isLast { model.index += 1 }
          case .decrement: if model.index > 0 { model.index -= 1 }
          @unknown default: break
          }
        }
      }

      Button {
        if reduceMotion { model.next() } else { withAnimation(.easeInOut(duration: 0.3)) { model.next() } }
      } label: {
        Text(model.isLast ? "Понятно" : "Дальше")
          .font(.system(size: 16, weight: .semibold))
          .foregroundColor(Color(p.onPrimary))
          .frame(maxWidth: .infinity, minHeight: Metrics.button)
          .background(RoundedRectangle(cornerRadius: Metrics.radiusL).fill(Color(p.primaryFill)))
      }
      .buttonStyle(WhatsNewPressableStyle())
    }
    .padding(.horizontal, Metrics.l)
    .padding(.top, Metrics.s)
    .padding(.bottom, Metrics.m)
  }
}

/// Нажатие — прозрачность 0.85, как у Pressable в RN
private struct WhatsNewPressableStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label.opacity(configuration.isPressed ? 0.85 : 1)
  }
}

private struct WhatsNewPageView: View {
  let page: WhatsNewPage
  let palette: WhatsNewPalette
  let onTry: () -> Void

  // Dynamic Type: размеры шкалы брендбука растут вместе с настройкой шрифта
  @ScaledMetric(relativeTo: .title2) private var titleSize: CGFloat = 24
  @ScaledMetric(relativeTo: .body) private var textSize: CGFloat = 16
  @ScaledMetric(relativeTo: .caption) private var tagSize: CGFloat = 12

  var body: some View {
    // При крупном шрифте страница прокручивается, а не обрезается
    ScrollView(showsIndicators: false) {
      VStack(alignment: .leading, spacing: Metrics.m) {
        if page.items.isEmpty == false {
          WhatsNewSummaryArt(items: page.items, palette: palette, textSize: textSize)
        } else if let art = page.art, WhatsNewArtView.supports(art) {
          WhatsNewArtView(art: art, palette: palette)
            .frame(maxWidth: .infinity)
            .frame(height: Metrics.art)
            .background(RoundedRectangle(cornerRadius: Metrics.radiusXL).fill(Color(palette.surfaceVariant)))
            .clipShape(RoundedRectangle(cornerRadius: Metrics.radiusXL))
            .accessibilityHidden(true)
        }

        VStack(alignment: .leading, spacing: Metrics.xs) {
          if !page.tag.isEmpty {
            Text(page.tag)
              .font(.system(size: tagSize, weight: .semibold))
              .foregroundColor(Color(palette.primary))
              .padding(.horizontal, 10)
              .padding(.vertical, 3)
              .background(Capsule().fill(Color(palette.primary).opacity(0.2)))
          }
          Text(page.title)
            .font(.system(size: titleSize, weight: .bold))
            .foregroundColor(Color(palette.textPrimary))
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityAddTraits(.isHeader)
          if !page.text.isEmpty {
            Text(page.text)
              .font(.system(size: textSize))
              .lineSpacing(4)
              .foregroundColor(Color(palette.textSecondary))
              .fixedSize(horizontal: false, vertical: true)
          }
        }

        if let label = page.actionLabel, !label.isEmpty {
          Button(action: onTry) {
            Text("\(label) →")
              .font(.system(size: textSize, weight: .semibold))
              .foregroundColor(Color(palette.primary))
              .frame(minHeight: Metrics.touch)
          }
          .buttonStyle(WhatsNewPressableStyle())
        }
      }
      .padding(.horizontal, Metrics.l)
      .padding(.top, Metrics.s)
      .padding(.bottom, Metrics.m)
    }
  }
}

// MARK: - Иллюстрации

/// Иллюстрации по `art` (WHATS_NEW_ARTS в src/types/whatsNew.ts). Только токены темы.
private struct WhatsNewArtView: View {
  let art: String
  let palette: WhatsNewPalette

  static func supports(_ art: String) -> Bool {
    ["swipe", "share", "books", "glass", "xp"].contains(art)
  }

  var body: some View {
    switch art {
    case "swipe": SwipeArt(p: palette)
    case "share": ShareArt(p: palette)
    case "books": BooksArt(p: palette)
    case "glass": GlassArt(p: palette)
    case "xp": XpArt(p: palette)
    default: EmptyView()
    }
  }
}

/// Карточка качается влево/вправо, по бокам — «Не знаю» / «Уверенно», внизу три кнопки
private struct SwipeArt: View {
  let p: WhatsNewPalette
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var phase: CGFloat = 0

  var body: some View {
    ZStack {
      HStack {
        SideLabel(text: "← Не знаю", color: p.errorText, fill: p.error)
        Spacer()
        SideLabel(text: "Уверенно →", color: p.successText, fill: p.success)
      }
      .padding(.horizontal, Metrics.s)
      .offset(y: -18)

      VStack(spacing: Metrics.xxs) {
        Text("serendipity")
          .font(.system(size: 20, weight: .semibold))
          .foregroundColor(Color(p.textPrimary))
        Text("свайпни")
          .font(.system(size: 12))
          .foregroundColor(Color(p.textTertiary))
      }
      .frame(width: 150, height: 150)
      .background(RoundedRectangle(cornerRadius: 18).fill(Color(p.surface)))
      .overlay(RoundedRectangle(cornerRadius: 18).stroke(Color(p.border), lineWidth: 1))
      .rotationEffect(.degrees(Double(phase) * 9))
      .offset(x: phase * 44, y: -18)

      VStack {
        Spacer()
        HStack(spacing: 6) {
          RateChip(text: "Не знаю", color: p.errorText, p: p)
          RateChip(text: "Почти", color: p.warningText, p: p)
          RateChip(text: "Уверенно", color: p.successText, p: p)
        }
      }
      .padding(Metrics.s)
    }
    .onAppear {
      guard !reduceMotion else { return }
      phase = -1
      withAnimation(.easeInOut(duration: 1.6).repeatForever(autoreverses: true)) { phase = 1 }
    }
  }

  private struct SideLabel: View {
    let text: String
    let color: UIColor
    let fill: UIColor
    var body: some View {
      Text(text)
        .font(.system(size: 12, weight: .semibold))
        .foregroundColor(Color(color))
        .padding(.horizontal, Metrics.xs)
        .padding(.vertical, Metrics.xxs)
        .background(RoundedRectangle(cornerRadius: 8).fill(Color(fill).opacity(0.1)))
    }
  }

  private struct RateChip: View {
    let text: String
    let color: UIColor
    let p: WhatsNewPalette
    var body: some View {
      Text(text)
        .font(.system(size: 12, weight: .semibold))
        .foregroundColor(Color(color))
        .frame(maxWidth: .infinity, minHeight: 30)
        .background(RoundedRectangle(cornerRadius: 10).fill(Color(p.surface)))
    }
  }
}

/// Набор, ссылка на него и сообщение в чате
private struct ShareArt: View {
  let p: WhatsNewPalette

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(spacing: 10) {
        RoundedRectangle(cornerRadius: 10).fill(Color(p.gameTeal)).frame(width: 36, height: 36)
        VStack(alignment: .leading, spacing: 0) {
          Text("Irregular verbs").font(.system(size: 14, weight: .semibold)).foregroundColor(Color(p.textPrimary))
          Text("48 карточек").font(.system(size: 12)).foregroundColor(Color(p.textSecondary))
        }
        Spacer(minLength: 0)
      }
      .padding(Metrics.s)
      .background(RoundedRectangle(cornerRadius: Metrics.radiusL).fill(Color(p.surface)))

      HStack {
        Text("…/s/K7Q2MX").font(.system(size: 14, weight: .semibold, design: .monospaced))
        Spacer(minLength: 0)
        Image(systemName: "doc.on.doc").font(.system(size: 14, weight: .semibold))
      }
      .foregroundColor(Color(p.onPrimary))
      .padding(.horizontal, Metrics.s)
      .padding(.vertical, 10)
      .background(RoundedRectangle(cornerRadius: 14).fill(Color(p.primaryFill)))

      HStack {
        Spacer(minLength: 0)
        Text("Держи, тут все глаголы к тесту")
          .font(.system(size: 14))
          .foregroundColor(Color(p.textPrimary))
          .padding(.horizontal, Metrics.s)
          .padding(.vertical, Metrics.xs)
          .background(RoundedRectangle(cornerRadius: Metrics.radiusL).fill(Color(p.surface)))
      }
    }
    .frame(width: 236)
  }
}

/// Четыре корешка новых книг
private struct BooksArt: View {
  let p: WhatsNewPalette

  var body: some View {
    HStack(alignment: .bottom, spacing: Metrics.xs) {
      Book(title: "Academic words", color: p.gameViolet, height: 150, p: p)
      Book(title: "Inside Reading", color: p.gameTeal, height: 128, p: p)
      Book(title: "Navigate A2 · B1", color: p.gameRose, height: 160, p: p)
      Book(title: "Solutions Pre-Int.", color: p.gameGreen, height: 138, p: p)
    }
  }

  private struct Book: View {
    let title: String
    let color: UIColor
    let height: CGFloat
    let p: WhatsNewPalette
    var body: some View {
      Text(title)
        .font(.system(size: 12, weight: .semibold))
        .foregroundColor(Color(p.onPrimary))
        .multilineTextAlignment(.leading)
        .padding(6)
        .frame(width: 62, height: height, alignment: .bottomLeading)
        .background(
          RoundedRectangle(cornerRadius: 8)
            .fill(Color(color))
            .overlay(Rectangle().fill(Color.black.opacity(0.18)).frame(width: 4), alignment: .leading)
            .clipShape(RoundedRectangle(cornerRadius: 8))
        )
    }
  }
}

/// Капсула вкладок поверх яркого фона
private struct GlassArt: View {
  let p: WhatsNewPalette

  var body: some View {
    ZStack {
      LinearGradient(colors: [Color(p.streak), Color(p.like), Color(p.primary)], startPoint: .topLeading, endPoint: .bottomTrailing)
      Circle().fill(Color(p.warningText).opacity(0.8)).frame(width: 120, height: 120).offset(x: -70, y: -40)
      VStack {
        Spacer()
        HStack {
          Text("Главная")
            .padding(.horizontal, Metrics.s)
            .padding(.vertical, 6)
            .background(Capsule().fill(Color.white.opacity(0.35)))
          Spacer()
          Text("Наборы")
          Spacer()
          Text("Профиль")
        }
        .font(.system(size: 12, weight: .semibold))
        .foregroundColor(.white)
        .padding(.horizontal, Metrics.m)
        .frame(height: 56)
        .background(Capsule().fill(.ultraThinMaterial))
        .overlay(Capsule().stroke(Color.white.opacity(0.5), lineWidth: 1))
        .padding(.horizontal, Metrics.l)
        .padding(.bottom, 22)
      }
    }
  }
}

/// Уровень и полоса опыта
private struct XpArt: View {
  let p: WhatsNewPalette

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack {
        Text("Уровень 7").font(.system(size: 14, weight: .semibold)).foregroundColor(Color(p.textPrimary))
        Spacer()
        Text("1 240 / 2 000").font(.system(size: 14).monospacedDigit()).foregroundColor(Color(p.textSecondary))
      }
      GeometryReader { geo in
        ZStack(alignment: .leading) {
          Capsule().fill(Color(p.surfaceMuted))
          Capsule().fill(Color(p.primary)).frame(width: geo.size.width * 0.62)
        }
      }
      .frame(height: 10)
      HStack(spacing: Metrics.xxs) {
        Image(systemName: "checkmark").font(.system(size: 12, weight: .semibold))
        Text("Опыт только за честные ответы").font(.system(size: 12))
      }
      .foregroundColor(Color(p.successText))
    }
    .padding(Metrics.m)
    .frame(width: 236)
    .background(RoundedRectangle(cornerRadius: 18).fill(Color(p.surface)))
  }
}

/// Страница «И ещё»: заголовки остальных новостей
private struct WhatsNewSummaryArt: View {
  let items: [String]
  let palette: WhatsNewPalette
  let textSize: CGFloat

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      ForEach(Array(items.enumerated()), id: \.offset) { _, title in
        HStack(alignment: .firstTextBaseline, spacing: 10) {
          Circle().fill(Color(palette.primary)).frame(width: 8, height: 8)
          Text(title)
            .font(.system(size: textSize))
            .foregroundColor(Color(palette.textPrimary))
            .fixedSize(horizontal: false, vertical: true)
          Spacer(minLength: 0)
        }
        .padding(.horizontal, Metrics.s)
        .padding(.vertical, 10)
        .background(RoundedRectangle(cornerRadius: 14).fill(Color(palette.surfaceVariant)))
      }
    }
  }
}
