/**
 * Slot owners: data — HeaderData and FirstLaunch, which ChartArea shows until there are a script
 * and data; results — ReportTab, EquityTab, TradesTab; backtest — RunControls, ChartArea,
 * Sidebar, CodeTab, IssuesTab; optimization summary — preview/PreviewBanner, which ChartArea shows
 * above the chart (B16). Dock owns the tabs and sizing. Header slots live in shell/; dialog slots
 * mount once at shell/DialogsRoot.
 */
import { Workbench } from '../../shell/Workbench.tsx';
import { ChartArea } from './ChartArea.tsx';
import { Dock } from './Dock.tsx';
import { Sidebar } from './Sidebar.tsx';

export function BacktestPage() {
  return (
    <Workbench
      page="backtest"
      main={
        <Dock>
          <ChartArea />
        </Dock>
      }
      sidebar={<Sidebar />}
    />
  );
}
