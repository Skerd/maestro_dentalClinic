import type {IClinicMessage} from "@dentalClinicModule/database/schemas/clinicMessage/clinicMessage";
import type {ClinicMessage} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/clinicMessage/clinicMessage.dto";
import type {SimpleBlankUser} from "armonia/src/modules/core/dto/user.dto";
import type {Media} from "armonia/src/modules/core/types";
import type {IMedia} from "@coreModule/database/schemas/media/media";
import {dateToISOString, mapMedia, mapSnippet} from "@coreModule/utilities/mappers/common.mapper";
import {SimpleBlankUserSnippet} from "@coreModule/database/schemas/user/user.snippets";

/** `mapMedia` reads `metadata.size`; the thread populates attachments without `metadata`, so the size comes from `sizeInBytes`. */
function attachmentToDTO(media: IMedia): Media | undefined {
    const mapped = mapMedia(media);
    return mapped && {...mapped, size: media.sizeInBytes ?? mapped.size};
}

/** A thread message for clinic staff; `author` must be populated for staff names. */
export function clinicMessageToDTO(message: IClinicMessage): ClinicMessage {
    const author = mapSnippet<SimpleBlankUser>()(message.author, SimpleBlankUserSnippet);
    return {
        _id: message._id.toString(),
        from: message.from,
        authorName: message.from === "clinic" && author ? `${author.name} ${author.surname}`.trim() : undefined,
        body: message.body,
        attachments: (message.attachments ?? []).map(attachmentToDTO).filter((media) => media !== undefined),
        readAt: message.readAt ? dateToISOString(message.readAt) : undefined,
        createdAt: dateToISOString(message.createdAt),
    };
}
