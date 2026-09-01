import FullPageNotFoundView from '@components/BlockingViews/FullPageNotFoundView';

import useIsAgentAccount from '@hooks/useIsAgentAccount';

import Navigation from '@libs/Navigation/Navigation';

import ROUTES from '@src/ROUTES';

import {useFocusEffect, useIsFocused} from '@react-navigation/native';
import React, {useCallback, useEffect, useRef} from 'react';

// Shared by every guarded screen. Two of them can be mounted at once (the Agents central pane under the
// agent-edit RHP) and both fire redirectAgentAway when the session flips to an agent. dismissModal dispatches
// DISMISS_MODAL synchronously, so by the time the second instance's continuation runs there is no modal on top
// any more and it navigates to Profile right away, while the RHP is still animating out. With Profile already
// active, the dismissing RHP re-renders with shouldRedirect false and paints the access-denied view for the
// length of the exit animation. Only one instance may own the redirect at a time.
let isAgentRedirectInFlight = false;

function withAgentAccessDenied(getComponent: () => React.ComponentType): () => React.ComponentType {
    let ProtectedComponent: React.ComponentType | undefined;
    return () => {
        if (!ProtectedComponent) {
            const Component = getComponent();
            ProtectedComponent = (props) => {
                const isAgent = useIsAgentAccount();
                const isFocused = useIsFocused();
                const ownsRedirectRef = useRef(false);
                const isAlreadyOnRedirectTarget = Navigation.isActiveRoute(ROUTES.SETTINGS_PROFILE.route);
                const shouldRedirect = isAgent === true && !isAlreadyOnRedirectTarget;

                const releaseRedirect = useCallback(() => {
                    if (!ownsRedirectRef.current) {
                        return;
                    }
                    ownsRedirectRef.current = false;
                    isAgentRedirectInFlight = false;
                }, []);

                const redirectAgentAway = useCallback(() => {
                    if (isAgent !== true || isAgentRedirectInFlight) {
                        return;
                    }

                    // Claim the redirect before awaiting readiness so a sibling guarded screen whose effect runs in
                    // the same tick sees the claim and stays out.
                    isAgentRedirectInFlight = true;
                    ownsRedirectRef.current = true;

                    // On a cold deep-link the effect can run before the NavigationContainer is ready, so the
                    // redirect is silently dropped and leaves a blank central pane. Wait for readiness before
                    // reading navigation state or dispatching.
                    Navigation.isNavigationReady().then(() => {
                        if (Navigation.isActiveRoute(ROUTES.SETTINGS_PROFILE.route)) {
                            releaseRedirect();
                            return;
                        }

                        // forceReplace REPLACEs the stale guarded central-pane route instead of PUSHing Profile on
                        // top of it, so back from Profile pops to the unguarded Account sidebar rather than the
                        // guarded route that would re-fire this redirect.
                        const redirectToProfile = () => {
                            releaseRedirect();
                            Navigation.navigate(ROUTES.SETTINGS_PROFILE.getRoute(), {forceReplace: true});
                        };

                        // The guarded screen can be open inside a modal/RHP (e.g. the agent-edit page the owner was
                        // on when they tapped "Copilot into account"), or an unguarded RHP (e.g. the agent DM) can be
                        // sitting on top of this guarded central pane. Navigating straight to the tab-nested Profile
                        // route while an RHP is focused gets forced to PUSH (see linkTo), stacking Profile on top of
                        // the still-guarded route and trapping the user in a Profile <-> Profile loop on back. Dismiss
                        // the modal first, then redirect once it's closed (the underlying pane may be unguarded, so we
                        // can't rely on its guard to redirect).
                        if (Navigation.isTopmostRouteModalScreen()) {
                            Navigation.dismissModal({afterTransition: redirectToProfile});
                            return;
                        }

                        redirectToProfile();
                    });
                }, [isAgent, releaseRedirect]);

                // Redirect on every focus (not just the initial transition from false to true) so navigating back
                // onto a guarded screen that the split navigator keeps mounted (e.g. a stale agents route
                // left over from the owner session) bounces the agent to a page they can access instead of
                // rendering a blank pane.
                useFocusEffect(redirectAgentAway);

                // useFocusEffect only fires while this screen is focused. When the session flips to an agent while
                // this guarded screen is mounted but NOT focused, for example the owner taps "Copilot into account" from
                // an unguarded RHP (the agent DM) sitting over this guarded central pane, useFocusEffect never runs,
                // so the pane renders null (blank background) until the RHP is closed. Drive the redirect off the
                // isAgent transition here too so the background is corrected immediately. Skip when focused since
                // useFocusEffect already covers that case.
                useEffect(() => {
                    if (isFocused) {
                        return;
                    }
                    redirectAgentAway();
                }, [isFocused, redirectAgentAway]);

                // If the owning screen unmounts before its redirect completes (the RHP finishes closing before
                // afterTransition fires), drop the claim so a later agent transition can redirect again.
                useEffect(() => releaseRedirect, [releaseRedirect]);

                if (isAgent === undefined || shouldRedirect) {
                    return null;
                }
                if (isAgent === true) {
                    return (
                        <FullPageNotFoundView
                            shouldShow
                            titleKey="delegate.notAllowed"
                            subtitleKey="delegate.noAccessMessage"
                            shouldShowLink={false}
                        />
                    );
                }
                return <Component {...props} />;
            };
        }
        return ProtectedComponent;
    };
}

export default withAgentAccessDenied;
