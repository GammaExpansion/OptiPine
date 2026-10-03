import { useUiStore } from '../state/ui.ts';
import { Header } from './Header.tsx';
import { Workbench } from './Workbench.tsx';
import styles from './Shell.module.css';

/** The workspace will provide readiness when script and data workflows are connected. */
export function Shell({ canOptimize = false }: { canOptimize?: boolean }) {
  const page = useUiStore((state) => state.page);
  return (
    <div className={styles.shell}>
      <Header canOptimize={canOptimize} />
      <Workbench key={page} page={page} />
    </div>
  );
}
