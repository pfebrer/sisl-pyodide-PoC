// Loads pyodide while logging the progress.
async function load_pyodide() {
    const loadingLogs = document.getElementById("loading-logs");

    loadingLogs.textContent =  "[1 / 3] Loading Pyodide...";
    let pyodide = await loadPyodide({
    stdin: () => {
        let result = prompt();
        echo(result);
        return result;
    },
    });

    globalThis.pyodide = pyodide;

    loadingLogs.textContent += "\n[2 / 3] Loading sisl dependencies...";

    await pyodide.loadPackage(["micropip", "numpy", "scipy", "xarray", "pyparsing", "netCDF4"])
    const micropip = pyodide.pyimport("micropip")
    globalThis.micropip = micropip
    await micropip.install("plotly")

    loadingLogs.textContent += "\n[3 / 3] Loading sisl...";
    await pyodide.loadPackage('sisl-0.14.2-cp311-cp311-emscripten_3_1_45_wasm32.whl')

    pyodide.runPython(`
        import sisl
        import sisl.viz
    `)

    document.getElementById("loading-div").classList.add("hidden");
    document.getElementById("content").classList.remove("hidden");
}

// Updates the plot method options according to the selected file.
// It also writes the files to the virtual filesystem.
updatePlotOptions = async function() {
    
    // Get the files from the file input
    var files = document.getElementById("file-selector").files;

    // Helper function that writes a file to the virtual filesystem
    async function writeFile(key){
        var file = files[key];
        const file_arr = await file.arrayBuffer()
        pyodide.FS.writeFile(file.name, new Uint8Array(file_arr))
    }

    // Write all files to the virtual filesystem)
    const promises = Object.keys(files).map(writeFile);
    // Wait for all files to be written
    await Promise.all(promises)

    // We currently just care about the first file. Get it.
    const file = files[0]
    // Use sisl to find out which plot methods are available
    // for this file.
    pyodide.runPython(
        `
        plot_handler = sisl.get_sile("${file.name}").plot
        options = list(plot_handler._dispatchs.keys())
        `
    )

    // Store the plot handler in the global javascript scope,
    // because we might use it in other functions
    globalThis.plot_handler = pyodide.globals.get("plot_handler")

    // Get the plotting options from python
    const plot_options = pyodide.globals.get("options").toJs()

    // Update the selector
    // We get it
    const plot_options_sel = document.getElementById("plot-method-selector")

    // Clear it
    while (plot_options_sel.firstChild) {
        plot_options_sel.removeChild(plot_options_sel.lastChild);
    }

    // And add the new options
    plot_options.forEach(element => {
        plot_options_sel.add(new Option(element, element));
    });

}

// Function that plots the current file with the selected method.
plotSelected = function() {
    // Retrieve the selected plotting method
    const plot_method = document.getElementById("plot-method-selector").value

    // Call sisl's object plot handler, accessing the method.
    // This will generate a plot
    const plot = plot_handler[plot_method]()

    // Render the plot
    renderPlot(plot)
}

// Function to render the plot using plotly.
renderPlot = function(plot) {

    // Set the plot variable in the python runtime so that it
    // can be accessed from python if the user wants to.
    pyodide.globals.set("plot", plot);

    // Convert the plot to a plotly json object.
    const plotly_json = plot.to_plotly_json().toJs({dict_converter: Object.fromEntries})

    // Draw the plot in the corresponding div.
    const plot_div = document.getElementById("plot-div")
    Plotly.newPlot(plot_div, plotly_json)
}

// Handles the submission of python code to run in the terminal.
handleTerminalSubmit = function(event) {
    event.preventDefault();

    // Gather the form values
    const form_data = new FormData(event.target);

    // Get the python code to run
    const command = form_data.get("terminal-input");
    
    // Run it
    const result = pyodide.runPython(command);

    // Display the output in the terminal-output div
    const output = document.getElementById("terminal-output");
    output.textContent = result;

    // Re render the (possibly updated) plot
    const plot = pyodide.globals.get("plot");
    renderPlot(plot)
}