import type {IClinicMessage} from "@dentalClinicModule/database/schemas/clinicMessage/clinicMessage";
import type {ClinicMessage} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/clinicMessage/clinicMessage.dto";
import type {SimpleBlankUser} from "armonia/src/modules/core/dto/user.dto";
import {dateToISOString, mapMedia, mapSnippet} from "@coreModule/utilities/mappers/common.mapper";
import {SimpleBlankUserSnippet} from "@coreModule/database/schemas/user/user.snippets";

/** A thread message for clinic staff; `author` must be populated for staff names. */
export function clinicMessageToDTO(message: IClinicMessage): ClinicMessage {
    const author = mapSnippet<SimpleBlankUser>()(message.author, SimpleBlankUserSnippet);
    return {
        _id: message._id.toString(),
        from: message.from,
        authorName: message.from === "clinic" && author ? `${author.name} ${author.surname}`.trim() : undefined,
        body: message.body,
        attachments: (message.attachments ?? []).map(mapMedia).filter((media) => media !== undefined),
        readAt: message.readAt ? dateToISOString(message.readAt) : undefined,
        createdAt: dateToISOString(message.createdAt),
    };
}
