//
//  ShareSetActions.m
//  Регистрация Swift-модулей набора по ссылке (меню «…» и лист жалобы) в React Native.
//

#import <React/RCTBridgeModule.h>
#import <React/RCTViewManager.h>

@interface RCT_EXTERN_MODULE(ShareMenuButtonManager, RCTViewManager)

RCT_EXPORT_VIEW_PROPERTY(items, NSArray)
RCT_EXPORT_VIEW_PROPERTY(menuTitle, NSString)
RCT_EXPORT_VIEW_PROPERTY(tint, UIColor)
RCT_EXPORT_VIEW_PROPERTY(onSelect, RCTDirectEventBlock)

@end

@interface RCT_EXTERN_MODULE(ShareReportSheetModule, NSObject)

RCT_EXTERN_METHOD(present:(NSDictionary *)options
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
