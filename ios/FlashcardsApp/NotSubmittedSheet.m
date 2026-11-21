//
//  NotSubmittedSheet.m
//  Регистрация Swift-модуля NotSubmittedSheetModule (лист «Кто не сдал» учителя) в React Native.
//

#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(NotSubmittedSheetModule, RCTEventEmitter)

RCT_EXTERN_METHOD(present:(NSDictionary *)options)

RCT_EXTERN_METHOD(update:(NSDictionary *)state)

RCT_EXTERN_METHOD(dismiss)

@end
