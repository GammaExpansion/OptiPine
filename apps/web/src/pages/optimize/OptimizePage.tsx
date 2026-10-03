import { Workbench } from '../../shell/Workbench.tsx';
import { OptimizeEmpty } from './OptimizeEmpty.tsx';
import { OptimizeSidebar } from './OptimizeSidebar.tsx';

export function OptimizePage() {
  return <Workbench page="optimize" main={<OptimizeEmpty />} sidebar={<OptimizeSidebar />} />;
}
