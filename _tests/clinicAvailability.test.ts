import {describe, expect, it} from "vitest";
import {ObjectId} from "mongodb";
import {blockedWindow, fitsWorkingTime, slotStarts, workingIntervals} from "@dentalClinicModule/utilities/services/clinicAvailability";
import {localDayInterval} from "@coreModule/utilities/time/timeWindows";

const ZURICH = "Europe/Zurich";
const locationId = new ObjectId();
const otherLocationId = new ObjectId();
// Wednesday 9 June 2027; Zurich is UTC+2 in summer.
const day = localDayInterval("2027-06-09", ZURICH);
const at = (iso: string) => new Date(iso);
const times = (dates: Date[]) => dates.map((date) => date.toISOString().slice(11, 16));

const location = {
    _id: locationId,
    timezone: ZURICH,
    openingHours: [{dayOfWeek: 3, startTime: "08:00", endTime: "18:00"}],
    closures: [] as {date: string; reason?: string}[],
};
const practitioner = {
    schedule: [
        {location: locationId, dayOfWeek: 3, startTime: "07:00", endTime: "12:00"},
        {location: otherLocationId, dayOfWeek: 3, startTime: "13:00", endTime: "17:00"},
    ],
};
const cleaning = {durationMinutes: 30, bufferBeforeMinutes: 0, bufferAfterMinutes: 15};
const rules = {slotIntervalMinutes: 30, minNoticeHours: 0, maxAdvanceDays: 3650};
const now = at("2027-01-01T00:00:00Z");

describe("workingIntervals", () => {
    it("keeps only this location's rows, inside its opening hours", () => {
        const work = workingIntervals(practitioner, location, day);
        // 07:00–12:00 rows cut to the 08:00 opening; the afternoon is at another location
        expect(work.map((i) => [i.start.toISOString(), i.end.toISOString()])).toEqual([["2027-06-09T06:00:00.000Z", "2027-06-09T10:00:00.000Z"]]);
    });

    it("is empty on a closed day", () => {
        expect(workingIntervals(practitioner, {...location, closures: [{date: "2027-06-09"}]}, day)).toEqual([]);
    });
});

describe("slotStarts", () => {
    const work = workingIntervals(practitioner, location, day);

    it("walks the grid from the start of working time, leaving room for the treatment", () => {
        const slots = slotStarts(work, [], cleaning, rules, now);
        expect(times(slots)).toEqual(["06:00", "06:30", "07:00", "07:30", "08:00", "08:30", "09:00", "09:30"]);
    });

    it("keeps the whole blocked window clear of other appointments, buffers included", () => {
        // An appointment 08:00–08:30 local with a 15 min clean-up blocks 06:00–06:45 UTC
        const busy = [blockedWindow(at("2027-06-09T06:00:00Z"), cleaning)];
        const slots = slotStarts(work, busy, cleaning, rules, now);
        expect(times(slots)).toEqual(["07:00", "07:30", "08:00", "08:30", "09:00", "09:30"]);
    });

    it("applies the minimum notice", () => {
        const slots = slotStarts(work, [], cleaning, {...rules, minNoticeHours: 2}, at("2027-06-09T05:30:00Z"));
        expect(times(slots)[0]).toBe("07:30");
    });
});

describe("fitsWorkingTime", () => {
    const work = workingIntervals(practitioner, location, day);

    it("lets staff book off the grid inside working time", () => {
        expect(fitsWorkingTime(at("2027-06-09T06:10:00Z"), work, [], cleaning)).toBe(true);
    });

    it("refuses a treatment that runs past the end of working time", () => {
        expect(fitsWorkingTime(at("2027-06-09T09:45:00Z"), work, [], cleaning)).toBe(false);
    });
});
