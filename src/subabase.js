import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  'https://mqroamvsunlfvxggifzc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1xcm9hbXZzdW5sZnZ4Z2dpZnpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0MzI3MTUsImV4cCI6MjA5NjAwODcxNX0.LObI9k9IyPGHADX_MQY7CZVaOzi7_iEuCkOgu-hHuUo'
);