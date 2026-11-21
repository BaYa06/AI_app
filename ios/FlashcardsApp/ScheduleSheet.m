//
//  ScheduleSheet.m
//  Регистрация Swift-модуля ScheduleSheetModule (нативный лист «Расписание занятий») в React Native.
//

#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(ScheduleSheetModule, RCTEventEmitter)

RCT_EXTERN_METHOD(present:(NSDictionary *)options)

RCT_EXTERN_METHOD(setLoaded:(NSArray *)days minutes:(nonnull NSNumber *)minutes)

RCT_EXTERN_METHOD(setBusy:(BOOL)busy)

RCT_EXTERN_METHOD(setError:(NSString *)error)

RCT_EXTERN_METHOD(finish)

RCT_EXTERN_METHOD(dismiss)

@end
