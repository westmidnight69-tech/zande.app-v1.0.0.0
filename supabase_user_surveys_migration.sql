-- Supabase User Experience Survey Migration

ALTER TABLE public.businesses 
ADD COLUMN IF NOT EXISTS login_count INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS survey_completed BOOLEAN DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS public.user_surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
  overall_rating INT,
  navigation_rating INT,
  feature_requests TEXT,
  feedback TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.user_surveys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own surveys"
ON public.user_surveys FOR INSERT
TO authenticated
WITH CHECK (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()));

CREATE POLICY "Users can view their own surveys"
ON public.user_surveys FOR SELECT
TO authenticated
USING (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()));
