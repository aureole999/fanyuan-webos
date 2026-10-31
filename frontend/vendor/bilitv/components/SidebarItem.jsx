import React, { useCallback } from 'react';
import { useFocusable, getCurrentFocusId } from '../hooks/useFocus';
import Icon from './Icon';

export default React.memo(function SidebarItem({ id, row, label, icon, active, onSelect }) {
  const handleSelect = useCallback(() => {
    onSelect?.();
  }, [onSelect]);

  const { props } = useFocusable({
    id, row, col: 0, group: 'sidebar', onSelect: handleSelect,
  });

  const focused = getCurrentFocusId() === id;

  return (
    <div {...props} role="button" aria-current={active ? 'page' : undefined} className={`sidebar-item ${active ? 'active' : ''} ${focused ? 'focused' : ''}`}>
      <span className="sidebar-icon"><Icon name={icon} size={26} /></span>
      <span className="sidebar-label">{label}</span>
    </div>
  );
});

