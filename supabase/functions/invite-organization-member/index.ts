import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const supportedSections = new Set([
  'dashboard',
  'customers',
  'inventory',
  'quotations',
  'official',
  'bot_orders',
  'accounting',
  'calendar',
  'backup',
  'tutorial',
  'contact',
]);

const response = (status: number, body: Record<string, unknown>) => new Response(
  JSON.stringify(body),
  {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  },
);

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return response(405, { error: 'Method not allowed.' });

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return response(401, { error: 'Authentication is required.' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error('Invite function is missing Supabase environment configuration.');
    return response(500, { error: 'Invitation service is not configured.' });
  }

  try {
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return response(401, { error: 'The access token is invalid or expired.' });
    }

    let payload: {
      organization_id?: unknown;
      email?: unknown;
      section_permissions?: unknown;
      role?: unknown;
    };
    try {
      const body: unknown = await request.json();
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return response(400, { error: 'Request body must be a JSON object.' });
      }
      payload = body as typeof payload;
    } catch {
      return response(400, { error: 'Request body must be valid JSON.' });
    }

    const organizationId = typeof payload.organization_id === 'string'
      ? payload.organization_id
      : '';
    const email = typeof payload.email === 'string'
      ? payload.email.trim().toLowerCase()
      : '';
    const sectionPermissions = payload.section_permissions;
    const requestedRole = payload.role === undefined ? 'member' : payload.role;
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(organizationId)
      || email.length > 254
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      || !sectionPermissions
      || typeof sectionPermissions !== 'object'
      || Array.isArray(sectionPermissions)
    ) {
      return response(400, { error: 'Organization, email, or section permissions are invalid.' });
    }
    if (requestedRole !== 'member' && requestedRole !== 'admin') {
      return response(400, { error: 'The requested organization role is invalid.' });
    }
    const role = requestedRole;

    const permissionEntries = Object.entries(sectionPermissions as Record<string, unknown>);
    if (permissionEntries.some(([key, value]) => (
      !supportedSections.has(key) || typeof value !== 'boolean'
    ))) {
      return response(400, { error: 'Section permissions contain an unsupported value.' });
    }
    const normalizedPermissions = Object.fromEntries(
      [...supportedSections].map((section) => [
        section,
        (sectionPermissions as Record<string, boolean>)[section] === true,
      ]),
    );

    const { data: actorMembership, error: membershipError } = await adminClient
      .from('organization_memberships')
      .select('role')
      .eq('organization_id', organizationId)
      .eq('user_id', userData.user.id)
      .maybeSingle();
    if (membershipError) {
      console.error('Could not verify invitation administrator:', membershipError.message);
      return response(500, { error: 'Could not verify organization administrator access.' });
    }
    if (!actorMembership || !['owner', 'admin'].includes(actorMembership.role)) {
      return response(403, { error: 'Organization administrator access is required.' });
    }
    if (role === 'admin' && actorMembership.role !== 'owner') {
      return response(403, { error: 'Only the organization owner can invite an administrator.' });
    }

    const { data: existingMembership, error: existingMembershipError } = await adminClient
      .from('organization_memberships')
      .select('user_id')
      .eq('organization_id', organizationId)
      .eq('email', email)
      .maybeSingle();
    if (existingMembershipError) {
      console.error('Could not check existing organization membership:', existingMembershipError.message);
      return response(500, { error: 'Could not verify the current organization membership.' });
    }
    if (existingMembership) {
      return response(409, { error: 'This email is already a member of the organization.' });
    }

    const redirectTo = Deno.env.get('INVITE_REDIRECT_URL');
    const inviteOptions = {
      data: { organization_id: organizationId },
      ...(redirectTo ? { redirectTo } : {}),
    };
    const { data: inviteData, error: inviteError } = await adminClient.auth.admin
      .inviteUserByEmail(email, inviteOptions);
    let invitedUser = inviteData.user;
    let existingUserAdded = false;
    if (
      inviteError
      && (inviteError.status === 422 || /already|exists|registered/i.test(inviteError.message))
    ) {
      for (let page = 1; page <= 100; page += 1) {
        const { data, error } = await adminClient.auth.admin.listUsers({
          page,
          perPage: 1000,
        });
        if (error) {
          console.error('Could not find an existing invitee:', error.message);
          return response(500, { error: 'Could not verify the existing user account.' });
        }
        invitedUser = data.users.find((candidate) => candidate.email?.toLowerCase() === email) || null;
        if (invitedUser || data.users.length < 1000) break;
      }
      if (invitedUser) existingUserAdded = true;
    } else if (inviteError) {
      return response(409, { error: `Could not invite this email: ${inviteError.message}` });
    }
    if (!invitedUser) {
      return response(500, { error: 'Supabase did not return an invited user.' });
    }

    const { error: insertError } = await adminClient
      .from('organization_memberships')
      .insert({
        organization_id: organizationId,
        user_id: invitedUser.id,
        email,
        role,
        section_permissions: normalizedPermissions,
        invited_by: userData.user.id,
      });
    if (insertError) {
      console.error('Invitation was sent but membership creation failed:', insertError.message);
      if (insertError.code === '23505') {
        return response(409, { error: 'This user is already a member of the organization.' });
      }
      return response(500, {
        error: 'The invitation was sent, but access could not be assigned. Contact the system administrator.',
      });
    }

    return response(200, {
      invited: !existingUserAdded,
      existing_user_added: existingUserAdded,
      role,
    });
  } catch (error) {
    console.error('Organization invitation failed:', error instanceof Error ? error.message : error);
    return response(500, { error: 'Invitation could not be completed.' });
  }
});
