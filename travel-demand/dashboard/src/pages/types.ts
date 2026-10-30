import type { Model } from "../domain/model";
import type { FilterApi } from "../state/filters";

export interface PageProps {
  readonly model: Model;
  readonly filters: FilterApi;
}
