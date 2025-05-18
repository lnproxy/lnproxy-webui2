const formDiv = document.getElementById("mainform");
const loadingDiv = document.getElementById("loading");
const resultDiv = document.getElementById("result");
const formInvoice = document.getElementById("invoice");
const formDescription = document.getElementById("description");
const formRouting = document.getElementById("routing");
const formRelay = document.getElementById("relay");
const relayList = document.getElementById("known_relays");
const toggleButton = document.getElementById("atoggle");
const advancedOptions = document.getElementById("advanced");
const wrapButton = document.getElementById("wrap");
const loading = document.getElementById("loading_message");

let availableRelays = [];
let failedRelays = new Set(); // Track failed relays during this session

formRelay.addEventListener("click", function() {
	this.value = '';
});

toggleButton.addEventListener("click", function() {
	if (advancedOptions.style.display === "block") {
		advancedOptions.style.display = "none";
		toggleButton.textContent = "more options ◀";
	} else {
		advancedOptions.style.display = "block";
		toggleButton.textContent = "less options ▼";
	}
});

formDiv.addEventListener("keydown", function(event) {
	if (event.key === "Enter") {
		event.preventDefault();
		wrapInvoice();
	}
});

formDiv.addEventListener("submit", function(event) {
	event.preventDefault();
	wrapInvoice();
});

function populateRelayList(relays) {
	availableRelays = relays;
	relays.forEach((relay) => {
		const option = document.createElement("option");
		option.value = relay;
		relayList.appendChild(option);
	});
	formRelay.value = "https://lnproxy.org/spec";
}

function getRandomRelay() {
	let candidateRelays = availableRelays.filter(relay => !failedRelays.has(relay));
	if (candidateRelays.length === 0) {
		candidateRelays = availableRelays
	}
	const randomIndex = Math.floor(Math.random() * candidateRelays.length);
	return candidateRelays[randomIndex];
 }

function fetchRelayList() {
	fetch('assets/relays.json')
		.then(response => response.json())
		.then(data => populateRelayList(data))
		.catch(error => {
			resultDiv.innerHTML += `
		<div class="error">
			Unable to fetch relay list.
		</div>
	`;
		})
}

// Ensure the relay list is populated before the user interacts with the page
document.addEventListener('DOMContentLoaded', fetchRelayList);

function wrapInvoice() {
	wrapButton.disabled = true;
	loading.style.display = "inline-block";
	const invoice = validInvoice(formInvoice.value);
	if (invoice === "") {
		resultDiv.innerHTML += `<div class="error">Error: Invalid invoice.</div>`;
		loading.style.display = "none";
		wrapButton.disabled = false;
		return;
	}
	const data = {
		invoice: invoice,
	};
	let relay = formRelay.value;
	if (advancedOptions.style.display === "block") {
		data.description = formDescription.value;
		const routing_sat = formRouting.value;
		if (routing_sat != "") {
			data.routing_msat = Math.round(1000*routing_sat).toString();
		}
	}
	resultDiv.innerHTML += `<h2>Proxying through ${relay}</h2>`;

	fetch(relay, {
		method: "POST",
		headers: {
			"Content-Type": "application/json"
		},
		body: JSON.stringify(data),
	})
	.then(response => response.json())
	.then(x => {
		if (x.status === "ERROR") {
			resultDiv.innerHTML += `<div class="error">${relay} error: ${x.reason}</div>`;
			failedRelays.add(relay);
			formRelay.value = getRandomRelay();
			loading.style.display = "none";
			wrapButton.disabled = false;
			return;
		}
		
		const parsed_invoice = parseInvoice(data.invoice);
		const parsed_proxy_invoice = parseInvoice(x.proxy_invoice);

		resultDiv.innerHTML += `
			<dl>
				<dt>Original invoice:</dt><dd class="invoice">
					${parsed_invoice.as_spans}
				</dd><dt>Wrapped invoice:</dt><dd class="invoice">
					${parsed_proxy_invoice.as_spans}
				</dd>
			</dl>
		`;

		if (parsed_invoice.hash !== parsed_proxy_invoice.hash) {
			resultDiv.innerHTML += `
				<div class="error">
					Hashes do not match, ${relay} might be evil!
				</div>
			`;
			loading.style.display = "none";
			wrapButton.disabled = false;
			failedRelays.add(relay);
			formRelay.value = getRandomRelay();
			return;
		}

		if (parsed_invoice.signature === parsed_proxy_invoice.signature) {
			resultDiv.innerHTML += `
				<div class="error">
					Destination is the same, try a different relay!
				</div>
			`;
			loading.style.display = "none";
			wrapButton.disabled = false;
			failedRelays.add(relay);
			formRelay.value = getRandomRelay();
			return;
		}

		if (("description" in data) && decodeBech32(parsed_proxy_invoice.description) !== data.description) {
			resultDiv.innerHTML += `
				<div class="error">
					Description does not match request, try a different relay!
				</div>
			`;
			loading.style.display = "none";
			wrapButton.disabled = false;
			failedRelays.add(relay);
			formRelay.value = getRandomRelay();
			return;
		}

		const routing_budget = parsed_proxy_invoice.msat_amount-parsed_invoice.msat_amount
		if ((parsed_invoice.msat_amount !== 0) && ("routing_msat" in data) && (routing_budget != data.routing_msat)) {
			resultDiv.innerHTML += `
				<div class="error">
					Routing budget does not match request, try a different relay!
				</div>
			`;
			loading.style.display = "none";
			wrapButton.disabled = false;
			failedRelays.add(relay);
			formRelay.value = getRandomRelay();
			return;
		}

		resultDiv.innerHTML += `
			<div>✅
				<span class="hash">Payment hashes</span> match.
			</div>
			<div>📍
				<span class="signature">Destination</span> proxied.
			</div>
		`;

		if (parsed_proxy_invoice.description_hash) {
			resultDiv.innerHTML += `
				<div>🏷️
					<span class="description">Description hash</span> is
					<span class="invoice">${parsed_proxy_invoice.description}</span>.
				</div>
			`;
		} else {
			resultDiv.innerHTML += `
				<div>🏷️
					<span class="description">Description</span> is
					"${decodeBech32(parsed_proxy_invoice.description)}".
				</div>
			`;
		}

		if (parsed_invoice.msat_amount !== 0) {
			resultDiv.innerHTML += `
				<div>💸
					<span class="amount">Routing budget</span>
					is ${Math.round(routing_budget/1000)} sats.
				</div>
			`;
		}

		resultDiv.innerHTML += `
			<a href="lightning:${x.proxy_invoice.toUpperCase()}">
			<div id="qrcode"></div></a>
		`;
		new QRCode(document.getElementById("qrcode"), {
			text: x.proxy_invoice.toUpperCase(),
			width: 400,
			height: 400,
			colorDark : "#000000",
			colorLight : "rgba(0, 0, 0, 0)",
			correctLevel : QRCode.CorrectLevel.M
		});


		loading.style.display = "none";
		wrapButton.disabled = false;
	})
	.catch(error => {
		resultDiv.innerHTML += `<div class="error">Error: Could not connect to ${relay}</div>`;
		loading.style.display = "none";
		wrapButton.disabled = false;
		failedRelays.add(relay);
		formRelay.value = getRandomRelay();
	});

};

function validInvoice(invoice) {
	let i = invoice.trim();
	i = i.toLowerCase().replace(/^lightning:/, "");
	if (! /^lnbc(?:[1-9][0-9]*[munp])?1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{111,}$/.test(i)) {
		return "";
	}
	return i;
};

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

const units = {
	p: 10 ** 12,
	n: 10 ** 9,
	u: 10 ** 6,
	m: 10 ** 3
};

function parseInvoice(invoice) {
	var spanned = "lnbc";
	const pos = invoice.lastIndexOf('1');
	let amount = invoice.slice(4, pos);
	if (amount === '') {
		amount = 0;
	} else {
		spanned += `<span class="amount" title="Amount">${invoice.slice(4, pos)}</span>`;
		amount = parseFloat(amount.slice(0, -1)) / units[amount.slice(-1)];
	}
	spanned += invoice.slice(pos, pos + 1 + 7);
	const data = invoice.slice(pos + 1 + 7, -110);
	var hash = "";
	var description = "";
	let description_hash = false;
	let i = 0;
	while (i < data.length) {
		const data_length = CHARSET.indexOf(data[i + 1]) * 32 + CHARSET.indexOf(data[i + 1 + 1]);
		spanned += data.slice(i, i + 3)
		if (data[i] === 'p' && data.slice(i + 1, i + 1 + 2) === 'p5') {
			hash = data.slice(i + 3, i + 3 + 52);
			spanned += `<span class="hash" title="Payment hash">${hash}</span>`;
		} else if (data[i] === 'd') {
			description = data.slice(i + 3, i + 3 + data_length);
			spanned += `<span class="description" title="Description">${description}</span>`;
		} else if (data[i] === 'h' && data.slice(i + 1, i + 1 + 2) === 'p5') {
			description_hash = true;
			description = data.slice(i + 3, i + 3 + 52);
			spanned += `<span class="description" title="Description hash">${description}</span>`;
		} else {
			spanned += data.slice(i + 3, i + 3 + data_length)
		}
		i += 3 + data_length;
	}
	const signature = invoice.substr(-110).slice(0, 104);
	spanned += `<span class="signature" title="Signature">${signature}</span>`;
	spanned += invoice.substr(-6);
	return {
		msat_amount: amount*1e11,
		hash: hash,
		description: description,
		description_hash: description_hash,
		signature: signature,
		as_spans: spanned,
	};
};

function decodeBech32(bech32String) {
	const fiveBitArray = Array.from(bech32String).map((char) => CHARSET.indexOf(char));
	const eightBitArray = [];
	let out_index = 0;
	let accumulator = 0;
	let bits = 0;
	for (let in_index = 0; in_index < fiveBitArray.length; in_index++) {
		accumulator <<= 5
		accumulator |= fiveBitArray[in_index];
		bits += 5;
		if (bits >= 8) {
			eightBitArray.push((accumulator >> (bits - 8)) & 0xFF);
			accumulator &= (1 << bits) - 1;
			bits -= 8;
		}
	}
	const decodedBytes = new Uint8Array(eightBitArray);
	const decoder = new TextDecoder('utf-8');
	return decoder.decode(decodedBytes);
};
