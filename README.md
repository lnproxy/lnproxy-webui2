# lnproxy-webui2

New webui for lnproxy

The new ui is just static files with some minimalistic and easily verifiable js code
that interacts with https://github.com/lnproxy/lnproxy through the REST API.

This change of architecture makes it much more secure for users since they
can run it locally and not have to trust the owner of lnproxy.org.
Thus, I took the opportunity to allow the code to request proxy invoices
from arbitrary relays and added some code that verifies that proxy invoices
returned have matching payment hashes and honor the requested
description and routing_msat fields.
