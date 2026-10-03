import { ChartArea } from './ChartArea.tsx';
import { PhoneDock } from './Dock.tsx';
import styles from './PhoneBacktest.module.css';

/** The Backtest page below 768 px (G3): the chart with its legend, then one tab row. */
export function PhoneBacktest() {
  return (
    <main className={styles.page}>
      <div className={styles.chart}>
        <ChartArea />
      </div>
      <PhoneDock />
    </main>
  );
}
