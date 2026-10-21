//
//  GlassView.m
//  Регистрация Swift-компонентов GlassView / GlassContainer (Liquid Glass) в React Native.
//

#import <React/RCTViewManager.h>

@interface RCT_EXTERN_MODULE(GlassViewManager, RCTViewManager)

RCT_EXPORT_VIEW_PROPERTY(tint, UIColor)
RCT_EXPORT_VIEW_PROPERTY(cornerRadius, CGFloat)
RCT_EXPORT_VIEW_PROPERTY(dark, BOOL)

@end
