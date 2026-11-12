//
//  TestTypeSheet.swift
//  Нативный лист «Выбери тип теста» (plan/new/teacher_cabinet.md, Teacher 11).
//
//  Повторяет RN-шторку src/screens/teacherCourseStats/TestLobbySheet.tsx: «Экзамен» и
//  «Устный тренажёр». Лист — UISheetPresentationController, как шторка режимов
//  (StudyModeSheet.swift). Тексты и цвета из JS.
//
//  JS → present(options), dismiss(). Обратно — событие TestTypeSheetEvent:
//  { type: 'select', kind: 'exam' | 'oral' } — уже после закрытия листа (переход без рывка),
//  { type: 'dismiss' }.
//

import SwiftUI
import UIKit

@objc(TestTypeSheetModule)
class TestTypeSheetModule: RCTEventEmitter, UISheetPresentationControllerDelegate {
  static let eventName = "TestTypeSheetEvent"

  private var hasListeners = false
  private weak var presented: UIViewController?

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
      sheet.dismiss(animated: true)
    }
  }

  private func close(_ host: UIViewController?, emitting body: [String: Any]) {
    guard let host, presented === host else { return }
    presented = nil
    host.dismiss(animated: true) { self.emit(body) }
  }

  private func presentSheet(_ options: NSDictionary) {
    guard presented == nil, let top = RCTPresentedViewController() else { return }

    let palette = TestTypePalette(options["colors"] as? NSDictionary ?? [:])
    let texts = options["texts"] as? NSDictionary ?? [:]
    func text(_ key: String, _ fallback: String) -> String { texts[key] as? String ?? fallback }

    var onSelect: (String) -> Void = { _ in }
    var onCancel: () -> Void = {}
    let view = TestTypeView(
      title: text("title", "Выбери тип теста"),
      close: text("close", "Закрыть"),
      options: [
        TestTypeOption(
          kind: "exam",
          symbol: "doc.text",
          title: text("examTitle", "Экзамен"),
          description: text("examDescription", ""),
          tint: palette.primary,
          fill: palette.primaryFill
        ),
        TestTypeOption(
          kind: "oral",
          symbol: "mic",
          title: text("oralTitle", "Устный тренажёр"),
          description: text("oralDescription", ""),
          tint: palette.streak,
          fill: palette.streak
        ),
      ],
      palette: palette,
      onSelect: { onSelect($0) },
      onCancel: { onCancel() }
    )

    let host = UIHostingController(rootView: view)
    host.view.backgroundColor = palette.surface
    host.overrideUserInterfaceStyle = (options["dark"] as? Bool ?? false) ? .dark : .light
    onSelect = { [weak self, weak host] kind in self?.close(host, emitting: ["type": "select", "kind": kind]) }
    onCancel = { [weak self, weak host] in self?.close(host, emitting: ["type": "dismiss"]) }

    host.modalPresentationStyle = .pageSheet
    if let sheet = host.sheetPresentationController {
      if #available(iOS 16.0, *) {
        let width = top.view.bounds.width
        let height = ceil(
          UIHostingController(rootView: view)
            .sizeThatFits(in: CGSize(width: width, height: .greatestFiniteMagnitude)).height
        )
        sheet.detents = [.custom(identifier: .init("content")) { context in min(height, context.maximumDetentValue) }]
      } else {
        sheet.detents = [.medium()]
      }
      sheet.prefersGrabberVisible = true
      sheet.preferredCornerRadius = 24
      sheet.delegate = self
    }

    presented = host
    top.present(host, animated: true)
  }

  func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
    guard presentationController.presentedViewController === presented else { return }
    presented = nil
    emit(["type": "dismiss"])
  }
}

/// Токены темы из JS (useThemeColors, переданы через processColor)
struct TestTypePalette {
  let surface: UIColor
  let surfaceMuted: UIColor
  let textPrimary: UIColor
  let textSecondary: UIColor
  let textTertiary: UIColor
  let primary: UIColor
  let primaryFill: UIColor
  let onPrimary: UIColor
  let streak: UIColor

  init(_ dict: NSDictionary) {
    func color(_ key: String, _ fallback: UIColor) -> UIColor {
      guard let value = dict[key] else { return fallback }
      return RCTConvert.uiColor(value) ?? fallback
    }
    surface = color("surface", .systemBackground)
    surfaceMuted = color("surfaceMuted", .secondarySystemBackground)
    textPrimary = color("textPrimary", .label)
    textSecondary = color("textSecondary", .secondaryLabel)
    textTertiary = color("textTertiary", .tertiaryLabel)
    primary = color("primary", .systemIndigo)
    primaryFill = color("primaryFill", .systemIndigo)
    onPrimary = color("onPrimary", .white)
    streak = color("streak", .systemOrange)
  }
}

struct TestTypeOption: Identifiable {
  let kind: String
  let symbol: String
  let title: String
  let description: String
  /// Цвет плашки (10 %) и рамки
  let tint: UIColor
  /// Заливка круга иконки
  let fill: UIColor
  var id: String { kind }
}

struct TestTypeView: View {
  let title: String
  let close: String
  let options: [TestTypeOption]
  let palette: TestTypePalette
  let onSelect: (String) -> Void
  let onCancel: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack(spacing: 8) {
        Text(title)
          .font(.system(size: 20, weight: .semibold))
          .foregroundColor(Color(palette.textPrimary))
          .accessibilityAddTraits(.isHeader)
        Spacer(minLength: 0)
        Button(action: onCancel) {
          Image(systemName: "xmark")
            .font(.system(size: 16, weight: .semibold))
            .foregroundColor(Color(palette.textSecondary))
            .frame(width: 36, height: 36)
            .background(Circle().fill(Color(palette.surfaceMuted)))
            .frame(width: 44, height: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(TestTypePressable())
        .accessibilityLabel(close)
      }
      ForEach(options) { option in
        Button { onSelect(option.kind) } label: {
          HStack(spacing: 12) {
            Image(systemName: option.symbol)
              .font(.system(size: 18, weight: .medium))
              .foregroundColor(Color(palette.onPrimary))
              .frame(width: 40, height: 40)
              .background(RoundedRectangle(cornerRadius: 12).fill(Color(option.fill)))
            VStack(alignment: .leading, spacing: 2) {
              Text(option.title)
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(Color(palette.textPrimary))
              if !option.description.isEmpty {
                Text(option.description)
                  .font(.system(size: 14))
                  .foregroundColor(Color(palette.textSecondary))
                  .fixedSize(horizontal: false, vertical: true)
              }
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.right")
              .font(.system(size: 14, weight: .semibold))
              .foregroundColor(Color(palette.textTertiary))
          }
          .padding(16)
          .background(RoundedRectangle(cornerRadius: 16).fill(Color(option.tint.withAlphaComponent(0.1))))
          .contentShape(RoundedRectangle(cornerRadius: 16))
        }
        .buttonStyle(TestTypePressable())
        .accessibilityLabel(option.description.isEmpty ? option.title : "\(option.title). \(option.description)")
      }
    }
    .padding(.horizontal, 16)
    .padding(.top, 24)
    .padding(.bottom, 24)
    .frame(maxWidth: .infinity, alignment: .topLeading)
    .background(Color(palette.surface).ignoresSafeArea())
  }
}

/// Нажатие — прозрачность 0.85, как у Pressable в RN
private struct TestTypePressable: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label.opacity(configuration.isPressed ? 0.85 : 1)
  }
}
