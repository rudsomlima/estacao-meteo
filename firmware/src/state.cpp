#include "state.h"

RTC_DATA_ATTR Sample rtcBuf[MAX_BATCH];
RTC_DATA_ATTR uint8_t rtcCount = 0;
RTC_DATA_ATTR time_t rtcNextDue = 0;
RTC_DATA_ATTR uint8_t rtcFails = 0;
RTC_DATA_ATTR uint8_t rtcSkipped = 0;
RTC_DATA_ATTR uint32_t rtcBootCount = 0;
RTC_DATA_ATTR uint8_t rtcLevel = 0;
RTC_DATA_ATTR bool rtcCharging = false;

bool coldBoot = false;
bool bootPortal = false;
