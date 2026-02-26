export function injectBadge() {
	if (document.getElementById("ch-badge")) return;

	const badge = document.createElement("div");
	badge.id = "ch-badge";
	badge.textContent = "CH";
	badge.title = "Better Coretax Active";

	// Basic styling in case CSS fails, but primary styling should be in injected.css
	Object.assign(badge.style, {
		position: "fixed",
		bottom: "20px",
		right: "20px",
		width: "40px",
		height: "40px",
		backgroundColor: "#ff5722",
		color: "white",
		borderRadius: "50%",
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		fontSize: "14px",
		fontWeight: "bold",
		boxShadow: "0 2px 10px rgba(0,0,0,0.3)",
		zIndex: "9999",
		cursor: "pointer",
		userSelect: "none",
	});

	document.body.appendChild(badge);
}
