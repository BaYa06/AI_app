//
//  JoinCodeSheet.swift
//  Нативный лист «Код подключения к курсу» (plan/new/teacher_cabinet.md, Teacher 10).
//
//  Повторяет RN-диалог src/components/CourseJoinCodeDialog.tsx: код крупно, «Копировать»,
//  «Поделиться», «Обновить код подключения», «В курсе N учеников» и последние подключившиеся.
//  Лист показывает UISheetPresentationController, как шторку режимов (StudyModeSheet.swift).
//  Данные и действия — в JS (useCourseJoinCode.ts); тексты и цвета тоже из JS.
//
//  JS → present(options), update(state), dismiss().
//  Обратно — событие JoinCodeSheetEvent: { type: 'copy' | 'share' | 'regenerate' | 'dismiss' }.
//  'regenerate' приходит уже после подтверждения системным алертом.
//

import SwiftUI
import UIKit

@objc(JoinCodeSheetModule)
class JoinCodeSheetModule: RCTEventEmitter, UISheetPresentationControllerDelegate {
  static let eventName = "JoinCodeSheetEvent"

  private var hasListeners = false
  private weak var presented: UIViewController?
  private var model: JoinCodeModel?
  private var relayout: () -> Void = {}

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

  @objc(update:)
  func update(_ state: NSDictionary) {
    DispatchQueue.main.async {
      self.model?.apply(state)
      self.relayout()
    }
  }

  @objc func dismiss() {
    DispatchQueue.main.async {
      self.model = nil
      guard let sheet = self.presented, sheet.presentingViewController != nil, !sheet.isBeingDismissed else { return }
      self.presented = nil
      sheet.dismiss(animated: true)
    }
  }

  private func presentSheet(_ options: NSDictionary) {
    guard presented == nil, let top = RCTPresentedViewController() else { return }

    let palette = JoinCodePalette(options["colors"] as? NSDictionary ?? [:])
    let model = JoinCodeModel(texts: JoinCodeTexts(options["texts"] as? NSDictionary ?? [:]), palette: palette)
    model.apply(options["state"] as? NSDictionary ?? [:])

    let host = UIHostingController(rootView: JoinCodeView(model: model))
    host.view.backgroundColor = palette.surface
    host.overrideUserInterfaceStyle = (options["dark"] as? Bool ?? false) ? .dark : .light

    model.onCopy = { [weak self] in
      UINotificationFeedbackGenerator().notificationOccurred(.success)
      self?.emit("copy")
    }
    model.onShare = { [weak self] in self?.emit("share") }
    model.onRegenerate = { [weak self, weak host, weak model] in
      guard let host, let model else { return }
      let t = model.texts
      let alert = UIAlertController(title: t.regenerateTitle, message: t.regenerateMessage, preferredStyle: .alert)
      alert.addAction(UIAlertAction(title: t.cancel, style: .cancel))
      alert.addAction(UIAlertAction(title: t.regenerateConfirm, style: .destructive) { _ in self?.emit("regenerate") })
      host.present(alert, animated: true)
    }
    model.onCancel = { [weak self, weak host] in
      guard let self, let host, self.presented === host else { return }
      self.presented = nil
      self.model = nil
      host.dismiss(animated: true) { self.emit("dismiss") }
    }

    host.modalPresentationStyle = .pageSheet
    if let sheet = host.sheetPresentationController {
      if #available(iOS 16.0, *) {
        // Высота по содержимому: код загрузился, пришли ученики — лист подстраивается
        let width = top.view.bounds.width
        let measure: () -> CGFloat = { [weak model] in
          guard let model else { return 0 }
          let size = UIHostingController(rootView: JoinCodeContent(model: model))
            .sizeThatFits(in: CGSize(width: width, height: .greatestFiniteMagnitude))
          return ceil(size.height)
        }
        var contentHeight = measure()
        sheet.detents = [.custom(identifier: .init("content")) { context in min(contentHeight, context.maximumDetentValue) }]
        relayout = { [weak sheet] in
          contentHeight = measure()
          sheet?.animateChanges { sheet?.invalidateDetents() }
        }
      } else {
        sheet.detents = [.medium(), .large()]
        relayout = {}
      }
      sheet.prefersGrabberVisible = true
      sheet.preferredCornerRadius = 24
      sheet.delegate = self
    }

    presented = host
    self.model = model
    top.present(host, animated: true)
  }

  // Закрыли жестом (свайп вниз, нажатие на затемнение)
  func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
    guard presentationController.presentedViewController === presented else { return }
    presented = nil
    model = nil
    emit("dismiss")
  }
}

// MARK: - Данные

struct JoinCodeJoiner: Identifiable {
  let id: Int
  let name: String
  let date: String
}

/// Тексты листа — из JS (JOIN_CODE_TEXTS); здесь только запасные
struct JoinCodeTexts {
  let title, close, description, copy, copied, share, regenerate: String
  let regenerateTitle, regenerateMessage, regenerateConfirm, cancel: String
  let failed, recentTitle, noStudents, codeHint: String

  init(_ dict: NSDictionary) {
    func text(_ key: String, _ fallback: String) -> String { dict[key] as? String ?? fallback }
    title = text("title", "Код подключения к курсу")
    close = text("close", "Закрыть")
    description = text("description", "")
    copy = text("copy", "Копировать")
    copied = text("copied", "Скопировано")
    share = text("share", "Поделиться")
    regenerate = text("regenerate", "Обновить код подключения")
    regenerateTitle = text("regenerateTitle", "Обновить код подключения?")
    regenerateMessage = text("regenerateMessage", "")
    regenerateConfirm = text("regenerateConfirm", "Обновить")
    cancel = text("cancel", "Отмена")
    failed = text("failed", "Не удалось получить код")
    recentTitle = text("recentTitle", "Последние подключились")
    noStudents = text("noStudents", "")
    codeHint = text("codeHint", "Нажми, чтобы скопировать")
  }
}

/// Токены темы из JS (useThemeColors, переданы через processColor)
struct JoinCodePalette {
  let surface: UIColor
  let surfaceMuted: UIColor
  let border: UIColor
  let textPrimary: UIColor
  let textSecondary: UIColor
  let primary: UIColor
  let primaryFill: UIColor
  let onPrimary: UIColor
  let errorText: UIColor

  init(_ dict: NSDictionary) {
    func color(_ key: String, _ fallback: UIColor) -> UIColor {
      guard let value = dict[key] else { return fallback }
      return RCTConvert.uiColor(value) ?? fallback
    }
    surface = color("surface", .systemBackground)
    surfaceMuted = color("surfaceMuted", .secondarySystemBackground)
    border = color("border", .separator)
    textPrimary = color("textPrimary", .label)
    textSecondary = color("textSecondary", .secondaryLabel)
    primary = color("primary", .systemIndigo)
    primaryFill = color("primaryFill", .systemIndigo)
    onPrimary = color("onPrimary", .white)
    errorText = color("errorText", .systemRed)
  }
}

final class JoinCodeModel: ObservableObject {
  let texts: JoinCodeTexts
  let palette: JoinCodePalette

  @Published var code: String?
  @Published var loading = true
  @Published var regenerating = false
  @Published var copied = false
  @Published var error: String?
  @Published var membersLabel: String?
  @Published var recent: [JoinCodeJoiner] = []

  var onCopy: () -> Void = {}
  var onShare: () -> Void = {}
  var onRegenerate: () -> Void = {}
  var onCancel: () -> Void = {}

  init(texts: JoinCodeTexts, palette: JoinCodePalette) {
    self.texts = texts
    self.palette = palette
  }

  func apply(_ state: NSDictionary) {
    code = state["code"] as? String
    loading = state["loading"] as? Bool ?? false
    regenerating = state["regenerating"] as? Bool ?? false
    copied = state["copied"] as? Bool ?? false
    error = state["error"] as? String
    membersLabel = state["membersLabel"] as? String
    recent = (state["recent"] as? [NSDictionary] ?? []).enumerated().map { index, item in
      JoinCodeJoiner(id: index, name: item["name"] as? String ?? "", date: item["date"] as? String ?? "")
    }
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
  static let touch: CGFloat = 44
  static let button: CGFloat = 52
}

struct JoinCodeView: View {
  @ObservedObject var model: JoinCodeModel

  var body: some View {
    ScrollView(showsIndicators: false) {
      JoinCodeContent(model: model)
    }
    .background(Color(model.palette.surface).ignoresSafeArea())
  }
}

struct JoinCodeContent: View {
  @ObservedObject var model: JoinCodeModel
  private var p: JoinCodePalette { model.palette }
  private var t: JoinCodeTexts { model.texts }

  var body: some View {
    VStack(alignment: .leading, spacing: Metrics.m) {
      header
      if !t.description.isEmpty {
        Text(t.description)
          .font(.system(size: 14))
          .foregroundColor(Color(p.textSecondary))
          .fixedSize(horizontal: false, vertical: true)
      }
      if model.loading {
        ProgressView()
          .tint(Color(p.primary))
          .frame(maxWidth: .infinity)
          .padding(.vertical, Metrics.m)
      } else if let code = model.code {
        codeBlock(code)
      } else {
        Text(t.failed)
          .font(.system(size: 14))
          .foregroundColor(Color(p.errorText))
      }
      if let membersLabel = model.membersLabel {
        members(membersLabel)
      }
    }
    .padding(.horizontal, Metrics.m)
    .padding(.top, Metrics.l)
    .padding(.bottom, Metrics.l)
  }

  private var header: some View {
    HStack(spacing: Metrics.xs) {
      Text(t.title)
        .font(.system(size: 20, weight: .semibold))
        .foregroundColor(Color(p.textPrimary))
        .accessibilityAddTraits(.isHeader)
      Spacer(minLength: 0)
      Button { model.onCancel() } label: {
        Image(systemName: "xmark")
          .font(.system(size: 16, weight: .semibold))
          .foregroundColor(Color(p.textSecondary))
          .frame(width: 36, height: 36)
          .background(Circle().fill(Color(p.surfaceMuted)))
          .frame(width: Metrics.touch, height: Metrics.touch)
          .contentShape(Rectangle())
      }
      .buttonStyle(PressableStyle())
      .accessibilityLabel(t.close)
    }
  }

  private func codeBlock(_ code: String) -> some View {
    VStack(spacing: Metrics.s) {
      Button { model.onCopy() } label: {
        Text(code)
          .font(.system(size: 32, weight: .bold).monospacedDigit())
          .tracking(8)
          .foregroundColor(Color(p.primary))
          .frame(maxWidth: .infinity)
          .padding(Metrics.m)
          .background(RoundedRectangle(cornerRadius: Metrics.radiusM).fill(Color(p.surfaceMuted)))
          .overlay(
            RoundedRectangle(cornerRadius: Metrics.radiusM)
              .strokeBorder(Color(p.primary.withAlphaComponent(0.4)), lineWidth: 1)
          )
      }
      .buttonStyle(PressableStyle())
      .accessibilityLabel("\(code.map(String.init).joined(separator: " ")). \(t.codeHint)")

      HStack(spacing: Metrics.s) {
        Button { model.onCopy() } label: {
          HStack(spacing: Metrics.xs) {
            if model.copied { Image(systemName: "checkmark") }
            Text(model.copied ? t.copied : t.copy)
          }
          .font(.system(size: 16, weight: .semibold))
          .foregroundColor(Color(p.onPrimary))
          .frame(maxWidth: .infinity, minHeight: Metrics.button)
          .background(RoundedRectangle(cornerRadius: Metrics.radiusM).fill(Color(p.primaryFill)))
        }
        .buttonStyle(PressableStyle())

        Button { model.onShare() } label: {
          Text(t.share)
            .font(.system(size: 16, weight: .semibold))
            .foregroundColor(Color(p.primary))
            .frame(maxWidth: .infinity, minHeight: Metrics.button)
            .overlay(
              RoundedRectangle(cornerRadius: Metrics.radiusM)
                .strokeBorder(Color(p.primary), lineWidth: 1.5)
            )
        }
        .buttonStyle(PressableStyle())
      }

      Button { model.onRegenerate() } label: {
        ZStack {
          if model.regenerating {
            ProgressView().tint(Color(p.textSecondary))
          } else {
            Text(t.regenerate)
              .font(.system(size: 16, weight: .semibold))
              .foregroundColor(Color(p.textSecondary))
          }
        }
        .frame(maxWidth: .infinity, minHeight: Metrics.touch)
        .contentShape(Rectangle())
      }
      .buttonStyle(PressableStyle())
      .disabled(model.regenerating)

      if let error = model.error {
        Text(error)
          .font(.system(size: 14))
          .foregroundColor(Color(p.errorText))
          .multilineTextAlignment(.center)
          .frame(maxWidth: .infinity)
      }
    }
  }

  private func members(_ label: String) -> some View {
    VStack(alignment: .leading, spacing: Metrics.xxs) {
      Rectangle().fill(Color(p.border)).frame(height: 1).padding(.bottom, Metrics.s)
      Text(label)
        .font(.system(size: 14, weight: .semibold))
        .foregroundColor(Color(p.textPrimary))
      if model.recent.isEmpty {
        if !t.noStudents.isEmpty {
          Text(t.noStudents)
            .font(.system(size: 14))
            .foregroundColor(Color(p.textSecondary))
        }
      } else {
        Text(t.recentTitle)
          .font(.system(size: 12))
          .foregroundColor(Color(p.textSecondary))
        ForEach(model.recent) { joiner in
          HStack(spacing: Metrics.s) {
            Text(joiner.name)
              .font(.system(size: 14))
              .foregroundColor(Color(p.textPrimary))
              .lineLimit(1)
            Spacer(minLength: 0)
            Text(joiner.date)
              .font(.system(size: 12))
              .foregroundColor(Color(p.textSecondary))
          }
          .accessibilityElement(children: .combine)
        }
      }
    }
  }
}

/// Нажатие — прозрачность 0.85, как у Pressable в RN
private struct PressableStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label.opacity(configuration.isPressed ? 0.85 : 1)
  }
}
