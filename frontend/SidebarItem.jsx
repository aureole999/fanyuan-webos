import React from 'react';
import Item from '@enact/sandstone/Item';
import {Icon} from './components';
import {useFocusable} from './focus';
export default React.memo(function SidebarItem({id,row,label,icon,active,onSelect}){
 const {props}=useFocusable({id,row,group:'sidebar',onSelect,onNavigate:direction=>direction==='up'&&row===0?'sidebar-settings':direction==='down'&&row===5?'sidebar-home':null});
 return <Item {...props} css={{bg:'sidebar-bg',slotBefore:'sidebar-icon'}} role="button" className={'sidebar-item '+(active?'active':'')} slotBefore={<Icon name={icon}/>} aria-label={label} aria-current={active?'page':undefined}><span className="sidebar-label">{label}</span></Item>;
});
