import { Document, Types } from "mongoose";
import { HaveMeInterface } from "./HaveMeInterface";
import { UserInterface } from "../UserInterface";

export interface ICollection extends Document, HaveMeInterface {
  title: string;
  owner: Types.ObjectId | UserInterface;
}
