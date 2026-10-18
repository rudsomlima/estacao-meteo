#include "events.h"
#include <sys/time.h>

RTC_DATA_ATTR static Event rtcEvents[MAX_EVENTS];
RTC_DATA_ATTR static uint8_t rtcEventCount = 0;

void pushEvent(EventKind kind, int32_t a, int32_t b, const char *s) {
  if (rtcEventCount == MAX_EVENTS) {  // cheio: descarta o mais antigo
    memmove(&rtcEvents[0], &rtcEvents[1], sizeof(Event) * (MAX_EVENTS - 1));
    rtcEventCount--;
  }
  Event &e = rtcEvents[rtcEventCount++];
  e.t = (uint32_t)time(nullptr);
  e.kind = kind;
  e.a = a;
  e.b = b;
  strlcpy(e.s, s ? s : "", sizeof(e.s));
}

uint8_t eventCount() { return rtcEventCount; }
const Event *eventList() { return rtcEvents; }
void clearEvents() { rtcEventCount = 0; }
