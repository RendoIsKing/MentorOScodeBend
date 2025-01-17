import {IsString} from "class-validator";

export class UpdateModuleInput {
    @IsString({message: 'title is required.'})
        // @ts-ignore
    title: string


}
