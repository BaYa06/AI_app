//
//  StudyModeSheet.m
//  Регистрация Swift-модуля StudyModeSheetModule (нативная шторка выбора режима) в React Native.
//

#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(StudyModeSheetModule, RCTEventEmitter)

RCT_EXTERN_METHOD(present:(NSDictionary *)options)

RCT_EXTERN_METHOD(dismiss)

@end
