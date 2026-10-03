/**
 * Slot owners: data — HeaderData and FirstLaunch; results — ChartArea, ReportTab, EquityTab,
 * TradesTab; backtest — RunControls, Sidebar, CodeTab, IssuesTab. Dock owns the tabs and sizing.
 * Header slots live in shell/; dialog slots mount once at shell/DialogsRoot.
 */
import { Workbench } from '../../shell/Workbench.tsx';
import { ChartArea } from './ChartArea.tsx';
import { Dock } from './Dock.tsx';
import { FirstLaunch } from './FirstLaunch.tsx';
import { Sidebar } from './Sidebar.tsx';

export function BacktestPage() {
  return (
    <Workbench
      page="backtest"
      main={
        <Dock>
          <ChartArea />
          <FirstLaunch />
        </Dock>
      }
      sidebar={<Sidebar />}
    />
  );
}
