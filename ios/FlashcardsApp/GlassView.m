//
//  GlassView.m
//  Регистрация Swift-компонентов GlassView / GlassContainer / GlassTabBar (Liquid Glass) в React Native.
//

#import <React/RCTViewManager.h>

@interface RCT_EXTERN_MODULE(GlassViewManager, RCTViewManager)

RCT_EXPORT_VIEW_PROPERTY(tint, UIColor)
RCT_EXPORT_VIEW_PROPERTY(cornerRadius, CGFloat)
RCT_EXPORT_VIEW_PROPERTY(dark, BOOL)

@end

@interface RCT_EXTERN_MODULE(GlassContainerManager, RCTViewManager)

RCT_EXPORT_VIEW_PROPERTY(spacing, CGFloat)

@end

@interface RCT_EXTERN_MODULE(GlassTabBarManager, RCTViewManager)

RCT_EXPORT_VIEW_PROPERTY(items, NSArray)
RCT_EXPORT_VIEW_PROPERTY(selectedKey, NSString)
RCT_EXPORT_VIEW_PROPERTY(onTabPress, RCTDirectEventBlock)

@end
