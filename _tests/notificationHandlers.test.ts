import fs from "fs";
import path from "path";
import {beforeAll, beforeEach, describe, expect, it, vi} from "vitest";
import {ObjectId} from "mongodb";
import type {createAndPushNotification} from "@coreModule/domain/notifications/notificationDomainService";

const mocks = vi.hoisted(() => ({createAndPush: vi.fn<Parameters<typeof createAndPushNotification>, Promise<object>>()}));

// The notification itself is recorded, not stored or pushed.
vi.mock("@coreModule/domain/notifications/notificationDomainService", () => ({createAndPushNotification: mocks.createAndPush}));

import {notificationEventBus} from "@coreModule/domain/notifications/notificationEventBus";
import {registerDentalClinicNotificationHandlers} from "@dentalClinicModule/domain/notifications/dentalClinicNotificationHandlers";
import {NotificationEventCodes} from "@dentalClinicModule/domain/notifications/notificationEventCodes";

const companyId = new ObjectId().toString();
const receiver = new ObjectId().toString();
/** The panel's messages; maestro is built without sinfonia in the deploy image. */
const panelTypes = path.resolve(__dirname, "../../../../sinfonia/src/modules/dentalClinic/assets/languages/en-US/notificationTypes.json");

async function paramsOf(code: string, payload: Record<string, unknown>) {
    mocks.createAndPush.mockReset().mockResolvedValue({});
    notificationEventBus.emit(code, {code, receiverIds: [receiver], payload: {companyId, ...payload}});
    await vi.waitFor(() => expect(mocks.createAndPush).toHaveBeenCalledTimes(1));
    return mocks.createAndPush.mock.calls[0][0].params;
}

beforeAll(() => {
    registerDentalClinicNotificationHandlers();
});

beforeEach(() => {
    mocks.createAndPush.mockReset().mockResolvedValue({});
});

// TD-B173: clinic alerts stored only English text, so they were neither translated nor listed to turn off.
describe("dentalClinic alerts carry their message values (D117)", () => {
    it("names the reference and, for an appointment, its time", async () => {
        expect(await paramsOf(NotificationEventCodes.APPOINTMENT_NEW, {appointmentId: "a1", number: "AP-1", when: "1 Dec 2026, 09:00"}))
            .toEqual({number: "AP-1", when: "1 Dec 2026, 09:00"});
        expect(await paramsOf(NotificationEventCodes.INQUIRY_NEW, {inquiryId: "i1", number: "IQ-1"})).toEqual({number: "IQ-1"});
    });

    it.skipIf(!fs.existsSync(panelTypes))("has a panel message and title for every code", () => {
        const codes = (JSON.parse(fs.readFileSync(panelTypes, "utf8")) as {dentalClinic: {codes: Record<string, {title?: string; message?: string}>}}).dentalClinic.codes;
        for (const code of Object.values(NotificationEventCodes)) {
            expect(codes[code]?.title, code).toBeTruthy();
            expect(codes[code]?.message, code).toBeTruthy();
        }
    });
});
