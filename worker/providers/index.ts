import type { DataSource, MarketProvider } from "../domain/types";
import { tiingoProvider } from "./tiingo";
import { tushareProvider } from "./tushare";
import { yahooProvider } from "./yahoo";

const providers: Record<DataSource, MarketProvider> = {
  yahoo: yahooProvider,
  tushare: tushareProvider,
  tiingo: tiingoProvider,
};

export function getProvider(source: DataSource): MarketProvider {
  return providers[source];
}
