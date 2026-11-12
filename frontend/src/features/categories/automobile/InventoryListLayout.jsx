import { useAutomobileListingLayout } from '../../../hooks/useAutomobileListingLayout.js';
import './automobileInventoryLists.css';

export function InventoryListLayout({ children }) {
  const useAutomobileLayout = useAutomobileListingLayout();
  return useAutomobileLayout ? <div className="auto-inventory-list">{children}</div> : children;
}
