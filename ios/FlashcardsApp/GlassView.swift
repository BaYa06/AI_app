//
//  GlassView.swift
//  Подложка Liquid Glass для RN (plan/new/liquid_glass.md, шаги Glass 1–2).
//
//  GlassView — RCTView со стеклом iOS 26 под детьми: UIVisualEffectView + UIGlassEffect.
//  На iOS < 26 (или в сборке старым Xcode) стекла нет — JS туда GlassView не ставит
//  (src/components/ui/GlassView.tsx рисует обычный View с прежним фоном).
//

import UIKit

@objc(GlassView)
class GlassView: RCTView {
  /// Стекло есть: сборка с SDK iOS 26 и устройство на iOS 26+
  static var isSupported: Bool {
    #if compiler(>=6.2)
    if #available(iOS 26.0, *) { return true }
    #endif
    return false
  }

  private let effectView = UIVisualEffectView(effect: nil)

  @objc var tint: UIColor? { didSet { updateEffect() } }
  @objc var cornerRadius: CGFloat = 0 { didSet { effectView.layer.cornerRadius = cornerRadius } }
  /// Тема приложения (может не совпадать с системной)
  @objc var dark: Bool = false { didSet { effectView.overrideUserInterfaceStyle = dark ? .dark : .light } }

  override init(frame: CGRect) {
    super.init(frame: frame)
    // Подложка не принимает касания: RN ищет цель касания по subviews, и стекло во весь размер
    // перехватило бы нажатия у детей
    effectView.isUserInteractionEnabled = false
    effectView.clipsToBounds = true
    effectView.layer.cornerCurve = .continuous
    insertSubview(effectView, at: 0)
    updateEffect()
  }

  required init?(coder: NSCoder) { fatalError("init(coder:) не используется") }

  override func layoutSubviews() {
    super.layoutSubviews()
    effectView.frame = bounds
    if subviews.first !== effectView { sendSubviewToBack(effectView) }
  }

  private func updateEffect() {
    #if compiler(>=6.2)
    if #available(iOS 26.0, *) {
      let effect = UIGlassEffect()
      effect.tintColor = tint
      effectView.effect = effect
      return
    }
    #endif
    effectView.effect = nil
  }
}

@objc(GlassViewManager)
class GlassViewManager: RCTViewManager {
  override func view() -> UIView! { GlassView() }

  @objc static func requiresMainQueueSetup() -> Bool { true }

  @objc func constantsToExport() -> [AnyHashable: Any]! { ["isSupported": GlassView.isSupported] }
}
