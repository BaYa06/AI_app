//
//  GlassTabBar.swift
//  Нижняя панель вкладок на iOS (plan/new/liquid_glass.md, шаг Glass 4.1).
//
//  Плавающая стеклянная капсула: под ней виден и размыт контент, активная вкладка — второй стеклянный
//  «пузырь», который при переключении перетекает к новой вкладке (сначала растягивается на обе вкладки,
//  потом пружиной собирается на новой). Тема — из JS (dark, Glass 4.2): в тёмной иконки и подписи белые,
//  пузырь светлее капсулы; в светлой иконки тёмные, пузырь, обводка и блики — тёмные полупрозрачные.
//  iOS 26 — системное стекло (UIGlassEffect в общем UIGlassContainerEffect, блики рисует система).
//  iOS < 26 — размытие UIBlurEffect, тонкая светлая обводка и блики — свои слои.
//
//  JS (src/components/ui/GlassTabBar.ios.tsx) задаёт items [{ key, title, symbol }], selectedKey, dark
//  и получает onTabPress { key }. Положение и размер капсулы задаёт JS.
//

import UIKit

@objc(GlassTabBar)
class GlassTabBar: UIView {
  @objc var items: NSArray = [] {
    didSet {
      guard !items.isEqual(oldValue) else { return }
      rebuildButtons()
    }
  }

  @objc var selectedKey: NSString? {
    didSet {
      guard selectedKey != oldValue else { return }
      select(index: keys.firstIndex(of: selectedKey as String? ?? ""), animated: window != nil)
    }
  }

  @objc var dark: Bool = true {
    didSet {
      guard dark != oldValue else { return }
      applyTheme()
    }
  }

  @objc var onTabPress: RCTDirectEventBlock?

  private static let inset: CGFloat = 4

  /// Слой капсулы: на iOS 26 — контейнер стекла, иначе — размытие
  private let backgroundView: UIVisualEffectView
  /// Куда кладём капсулу, пузырь и кнопки (на iOS 26 — contentView контейнера стекла)
  private let hostView: UIView
  private let capsule: UIView
  private let bubble: UIView
  private let buttonsView = UIView()
  private let glass: Bool

  // Обводка и блики для iOS < 26 (на iOS 26 их рисует стекло)
  private let rimGradient = CAGradientLayer()
  private let rimMask = CAShapeLayer()
  private let sheen = CAGradientLayer()

  private var keys: [String] = []
  private var buttons: [GlassTabButton] = []
  private var selectedIndex: Int?
  private var animator: UIViewPropertyAnimator?

  override init(frame: CGRect) {
    var useGlass = false
    #if compiler(>=6.2)
    if #available(iOS 26.0, *) { useGlass = true }
    #endif
    glass = useGlass

    let background = UIVisualEffectView(effect: nil)
    backgroundView = background
    capsule = useGlass ? UIVisualEffectView(effect: nil) : UIView()
    bubble = useGlass ? UIVisualEffectView(effect: nil) : UIView()
    hostView = useGlass ? background.contentView : UIView()

    super.init(frame: frame)
    accessibilityTraits = .tabBar

    addSubview(backgroundView)
    // Без стекла пузырь и кнопки лежат прямо над размытием
    let host = glass ? hostView : self
    if glass {
      hostView.addSubview(capsule)
    } else {
      backgroundView.clipsToBounds = true
      backgroundView.layer.cornerCurve = .continuous
      capsule.isUserInteractionEnabled = false
      backgroundView.contentView.addSubview(capsule)
      setUpFallbackHighlights()
    }
    bubble.isUserInteractionEnabled = false
    bubble.clipsToBounds = true
    bubble.layer.cornerCurve = .continuous
    host.addSubview(bubble)
    host.addSubview(buttonsView)
    applyTheme()
  }

  required init?(coder: NSCoder) { fatalError("init(coder:) не используется") }

  /// Цвет иконок и подписей
  private var contentColor: UIColor { dark ? .white : UIColor(white: 0.1, alpha: 1) }

  /// Перекрашивает панель под тему: стекло/размытие, обводку, блики, пузырь и вкладки
  private func applyTheme() {
    overrideUserInterfaceStyle = dark ? .dark : .light
    buttons.forEach { $0.setContentColor(contentColor) }

    #if compiler(>=6.2)
    if #available(iOS 26.0, *), glass {
      let container = UIGlassContainerEffect()
      container.spacing = 8
      backgroundView.effect = container
      (capsule as? UIVisualEffectView)?.effect = UIGlassEffect()
      let bubbleEffect = UIGlassEffect()
      // Пузырь заметнее капсулы: в тёмной теме светлее, в светлой темнее
      bubbleEffect.tintColor = dark ? UIColor.white.withAlphaComponent(0.18) : UIColor.black.withAlphaComponent(0.08)
      (bubble as? UIVisualEffectView)?.effect = bubbleEffect
      return
    }
    #endif

    let tone: UIColor = dark ? .white : .black
    backgroundView.effect = UIBlurEffect(style: dark ? .systemUltraThinMaterialDark : .systemThinMaterialLight)
    // Лёгкий тон поверх размытия: подписи читаются на любом фоне
    capsule.backgroundColor = dark ? UIColor.black.withAlphaComponent(0.18) : UIColor.white.withAlphaComponent(0.4)
    rimGradient.colors = (dark ? [0.45, 0.08, 0.22] : [0.10, 0.04, 0.12]).map { tone.withAlphaComponent($0).cgColor }
    sheen.colors = [UIColor.white.withAlphaComponent(dark ? 0.10 : 0.5).cgColor, UIColor.white.withAlphaComponent(0).cgColor]
    bubble.backgroundColor = tone.withAlphaComponent(dark ? 0.16 : 0.07)
    bubble.layer.borderColor = tone.withAlphaComponent(dark ? 0.3 : 0.08).cgColor
    // В светлой теме капсулу на белом фоне отделяет мягкая тень
    layer.shadowColor = UIColor.black.cgColor
    layer.shadowOpacity = dark ? 0 : 0.12
    layer.shadowRadius = 12
    layer.shadowOffset = CGSize(width: 0, height: 4)
  }

  /// iOS < 26: обводка с бликами сверху и снизу, мягкий блеск верхней половины. Цвета — в applyTheme
  private func setUpFallbackHighlights() {
    rimGradient.locations = [0, 0.5, 1]
    rimMask.fillColor = UIColor.clear.cgColor
    rimMask.strokeColor = UIColor.white.cgColor
    rimMask.lineWidth = 1
    rimGradient.mask = rimMask
    layer.addSublayer(rimGradient)

    sheen.locations = [0, 0.55]
    capsule.layer.addSublayer(sheen)

    // Обводка пузыря — border слоя: едет и растягивается вместе с пузырём
    bubble.layer.borderWidth = 1
  }

  // MARK: - Кнопки

  private func rebuildButtons() {
    buttons.forEach { $0.removeFromSuperview() }
    keys = []
    buttons = []
    for case let item as NSDictionary in items {
      let key = item["key"] as? String ?? ""
      let button = GlassTabButton(title: item["title"] as? String ?? "", symbol: item["symbol"] as? String ?? "circle.fill")
      button.setContentColor(contentColor)
      button.addTarget(self, action: #selector(handleTap(_:)), for: .touchUpInside)
      keys.append(key)
      buttons.append(button)
      buttonsView.addSubview(button)
    }
    selectedIndex = nil
    select(index: keys.firstIndex(of: selectedKey as String? ?? ""), animated: false)
    setNeedsLayout()
  }

  @objc private func handleTap(_ sender: GlassTabButton) {
    // Отклик вибрацией даёт слушатель tabPress в AppNavigator
    guard let index = buttons.firstIndex(of: sender) else { return }
    // Пузырь едет сразу, не дожидаясь JS; если навигация не переключит вкладку, selectedKey вернёт его
    select(index: index, animated: true)
    onTabPress?(["key": keys[index]])
  }

  // MARK: - Раскладка

  private func itemFrame(_ index: Int) -> CGRect {
    let inset = Self.inset
    let width = (bounds.width - inset * 2) / CGFloat(max(buttons.count, 1))
    return CGRect(x: inset + width * CGFloat(index), y: inset, width: width, height: bounds.height - inset * 2)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    let radius = bounds.height / 2
    backgroundView.frame = bounds
    backgroundView.layer.cornerRadius = radius
    capsule.frame = glass ? bounds : backgroundView.contentView.bounds
    capsule.layer.cornerRadius = radius
    capsule.layer.cornerCurve = .continuous
    capsule.clipsToBounds = true
    buttonsView.frame = bounds
    for (index, button) in buttons.enumerated() {
      button.frame = itemFrame(index)
    }
    bubble.layer.cornerRadius = (bounds.height - Self.inset * 2) / 2
    if animator == nil, let index = selectedIndex {
      bubble.frame = itemFrame(index)
    }

    if !glass {
      CATransaction.begin()
      CATransaction.setDisableActions(true)
      rimGradient.frame = bounds
      rimMask.path = UIBezierPath(roundedRect: bounds.insetBy(dx: 0.5, dy: 0.5), cornerRadius: radius).cgPath
      layer.shadowPath = UIBezierPath(roundedRect: bounds, cornerRadius: radius).cgPath
      sheen.frame = capsule.bounds
      CATransaction.commit()
    }
  }

  // MARK: - Выбор и перетекание пузыря

  private func select(index: Int?, animated: Bool) {
    guard index != selectedIndex else { return }
    let previous = selectedIndex
    selectedIndex = index
    for (i, button) in buttons.enumerated() {
      button.setSelected(i == index, bounce: animated && i == index)
    }

    guard let index, index < buttons.count, bounds.width > 0 else {
      bubble.isHidden = index == nil
      return
    }
    let target = itemFrame(index)
    // Пузырь продолжает движение с того места, где он сейчас на экране
    let current = bubble.layer.presentation()?.frame ?? bubble.frame
    animator?.stopAnimation(true)
    animator = nil

    guard animated, previous != nil, !bubble.isHidden, !UIAccessibility.isReduceMotionEnabled else {
      bubble.isHidden = false
      bubble.frame = target
      return
    }

    bubble.frame = current
    // Перетекание: пузырь вытягивается на обе вкладки, потом пружиной собирается на новой
    let stretched = current.union(target).insetBy(dx: 0, dy: 2)
    let stretch = UIViewPropertyAnimator(duration: 0.16, curve: .easeIn) { [weak self] in
      self?.bubble.frame = stretched
    }
    stretch.addCompletion { [weak self] position in
      guard let self, position == .end else { return }
      let settle = UIViewPropertyAnimator(duration: 0.5, dampingRatio: 0.72) {
        self.bubble.frame = target
      }
      settle.addCompletion { [weak self] _ in self?.animator = nil }
      self.animator = settle
      settle.startAnimation()
    }
    animator = stretch
    stretch.startAnimation()
  }
}

/// Вкладка: иконка SF Symbols и подпись цвета темы, без подложки. Неактивная — приглушённая.
final class GlassTabButton: UIControl {
  private let iconView = UIImageView()
  private let titleLabel = UILabel()
  private let stack: UIStackView

  init(title: String, symbol: String) {
    stack = UIStackView(arrangedSubviews: [iconView, titleLabel])
    super.init(frame: .zero)

    let config = UIImage.SymbolConfiguration(pointSize: 20, weight: .semibold)
    iconView.image = UIImage(systemName: symbol, withConfiguration: config) ?? UIImage(systemName: "circle.fill", withConfiguration: config)
    iconView.contentMode = .center
    titleLabel.text = title
    titleLabel.font = .systemFont(ofSize: 10, weight: .semibold)
    titleLabel.adjustsFontSizeToFitWidth = true
    titleLabel.minimumScaleFactor = 0.8

    stack.axis = .vertical
    stack.alignment = .center
    stack.spacing = 3
    stack.isUserInteractionEnabled = false
    addSubview(stack)

    isAccessibilityElement = true
    accessibilityLabel = title
    setSelected(false, bounce: false)
  }

  required init?(coder: NSCoder) { fatalError("init(coder:) не используется") }

  override func layoutSubviews() {
    super.layoutSubviews()
    let size = stack.systemLayoutSizeFitting(UIView.layoutFittingCompressedSize)
    let width = min(size.width, bounds.width - 4)
    stack.frame = CGRect(x: (bounds.width - width) / 2, y: (bounds.height - size.height) / 2, width: width, height: size.height)
  }

  func setContentColor(_ color: UIColor) {
    iconView.tintColor = color
    titleLabel.textColor = color
  }

  func setSelected(_ selected: Bool, bounce: Bool) {
    stack.alpha = selected ? 1 : 0.7
    accessibilityTraits = selected ? [.button, .selected] : .button
    guard bounce, !UIAccessibility.isReduceMotionEnabled else { return }
    iconView.transform = CGAffineTransform(scaleX: 1.15, y: 1.15)
    UIView.animate(withDuration: 0.45, delay: 0, usingSpringWithDamping: 0.5, initialSpringVelocity: 0.6) {
      self.iconView.transform = .identity
    }
  }

  override var isHighlighted: Bool {
    didSet {
      UIView.animate(withDuration: 0.12) {
        self.stack.transform = self.isHighlighted ? CGAffineTransform(scaleX: 0.92, y: 0.92) : .identity
      }
    }
  }
}

@objc(GlassTabBarManager)
class GlassTabBarManager: RCTViewManager {
  override func view() -> UIView! { GlassTabBar() }

  override static func requiresMainQueueSetup() -> Bool { true }
}
