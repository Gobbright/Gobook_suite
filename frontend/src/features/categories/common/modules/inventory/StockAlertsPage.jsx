import { useAutomobileListingLayout } from '../../../../../hooks/useAutomobileListingLayout.js';
import { AutomobileStockAlertsPage } from '../../../automobile/AutomobileStockAlertsPage.jsx';
import { StockAlertsView } from './StockAlertsView.jsx';

export function StockAlertsPage() {
  const automobile = useAutomobileListingLayout();
  return automobile ? <AutomobileStockAlertsPage /> : <StockAlertsView />;
}
