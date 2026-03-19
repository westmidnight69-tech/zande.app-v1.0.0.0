import { supabase } from './supabase';

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT' | 'UPLOAD' | 'DOWNLOAD';

interface AuditParams {
  business_id: string;
  user_id: string;
  session_id: string | null;
  action: AuditAction;
  entity_type: string;
  entity_id?: string;
  previous_data?: any;
  new_data?: any;
}

export async function logAuditAction(params: AuditParams) {
  try {
    const { error } = await supabase
      .from('audit_log')
      .insert([{
        business_id: params.business_id,
        user_id: params.user_id,
        session_id: params.session_id,
        action: params.action,
        entity_type: params.entity_type,
        entity_id: params.entity_id,
        previous_data: params.previous_data,
        new_data: params.new_data,
        ip_address: null, // Would need server-side or 3rd party service to get reliably on client
        user_agent: window.navigator.userAgent
      }]);

    if (error) {
      console.error('Audit log failed:', error.message);
    }
  } catch (err) {
    console.error('Error logging audit action:', err);
  }
}
