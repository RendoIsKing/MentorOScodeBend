import { HaveMeInterface } from "./HaveMeInterface";
import { UserInterface } from "../UserInterface";

export interface ICollection extends HaveMeInterface {
  _id?: string;
  id?: string;
  title: string;
  owner: string | UserInterface;
}
