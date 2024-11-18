import { model, Model } from "mongoose";
import { IUserData } from "../../types/interfaces/UserDataInterface";
import { UserDataSchema } from "../../database/schemas/userDataSchema";

const UserData: Model<IUserData> = model<IUserData>("UserData", UserDataSchema);

export { UserData };
