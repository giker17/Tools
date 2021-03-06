/* jshint -W030 */

window.App = {}
window.App.Context = {}
window.App.Options = {}

$(function() {
  "use strict"

  // From http://www.softcomplex.com/docs/get_window_size_and_scrollbar_position.html
  var filterResult = function(win, docel, body) {
    var result = win ? win : 0
    if (docel && (!result || (result > docel))) {
      result = docel
    }
    return body && (!result || (result > body)) ? body : result
  }

  var sliderHeight = function() {
    return filterResult(
      window.innerHeight ? window.innerHeight : 0,
      document.documentElement ? document.documentElement.clientHeight : 0,
      document.body ? document.body.clientHeight : 0)
  }

  var sliderPos = function() {
    return filterResult(
      window.pageYOffset ? window.pageYOffset : 0,
      document.documentElement ? document.documentElement.scrollTop : 0,
      document.body ? document.body.scrollTop : 0)
  }

  var getVerticalScrollProperties = function() {
    var height = $('html, body').height()
    return {
      'height': height,
      'sliderHeight': sliderHeight(),
      'sliderPos': sliderPos()
    }
  }

  var autoScroll = function(oldScrollProps) {
    var newScrollProps = getVerticalScrollProperties()
    var increment = newScrollProps.height - oldScrollProps.height
    $('html, body').animate({
      scrollTop: oldScrollProps.sliderPos + increment
    }, 'fast')
  }

  // Run the scipts of type=text/x-omnimarkup-config
  !function() {
    /* jshint -W061 */
    var scripts = $('script')
    scripts.each(function() {
      var type = String(this.type).replace(/ /g, '')
      if (type.match(/^text\/x-omnimarkup-config(;.*)?$/) && !type.match(/;executed=true/)) {
        this.type += ';executed=true'
        eval(this.innerHTML)
      }
    })
    /* jshint +W061 */
  }()

  var pollingInterval = window.App.Options.ajax_polling_interval
  var mathJaxEnabled = window.App.Options.mathjax_enabled
  var disconnected = false

  var reviveBuffer = function() {
    var request = {
      revivable_key: window.App.Context.revivable_key
    }

    $.ajax({
      type: 'POST',
      url: '/api/revive',
      data: JSON.stringify(request),
      dataType: 'json',
      contentType: 'application/json; charset=utf-8'
    }).done(function(data) {
      if (!data) {
        return
      }

      if (data.status === 'OK') {
        disconnected = false
        window.location.replace('/view/' + data.buffer_id.toString())
      }
    }).always(function() {
      if (disconnected) {
        setTimeout(reviveBuffer, Math.max(pollingInterval, 600))
      }
    })
  }
  
  // custom: add line no to code block
  var prefix_lineno = function(){
    var codeblocks = document.getElementsByClassName('codehilite')
    var codeblock = null
    var pre = null
    var preHeight = 0
    var lineHeight = 0
	
    var linenoblock = null
    var linenoline = null
    var linenum = 0
    var i, j, len = 0
    var prestyle = null
    for(i = 0, len = codeblocks.length; i < len; i++){
      codeblock = codeblocks[i]
      if(codeblock.getElementsByClassName('lineno-block').length <= 0){
        pre = codeblock.getElementsByTagName('pre')[0]
        prestyle = window.getComputedStyle(pre)
        lineHeight = parseFloat(prestyle.lineHeight)
        preHeight = parseFloat(prestyle.height) - parseFloat(prestyle.paddingTop) - parseFloat(prestyle.paddingBottom)

        // 17: 16.4 = 26 * 0.64; 1000: 999.68 = 1562 * 0.64
        // 1562 = 1000 * a + b; 26 = 17 * a + b
        // a = 1.5625635808748728; b = -0.5635808748727413

        linenum = parseInt(preHeight / (parseInt(1.5625635808748728 * lineHeight - 0.5635808748727413 + 0.5) * 64 / 100) + 0.5)
    
        linenoblock = document.createElement('div')
        linenoblock.classList = 'lineno-block'
        linenoblock.style.lineHeight = prestyle.lineHeight
        linenoblock.style.marginTop = prestyle.marginTop
        linenoblock.style.marginBottom = prestyle.marginBottom
        for (j = 0; j < linenum; j++){
          linenoline = document.createElement('span')
          linenoline.classList = 'lineno-line'
          linenoline.innerHTML = j + 1 + '.'
          linenoblock.appendChild(linenoline)
        }
        codeblock.prepend(linenoblock)
      }
    }
  }
  
  var float_toc = function(){
	var toc = document.getElementsByClassName('toc')[0]
	window.onscroll = window.onscroll || function(event){
	  toc.style.top = window.scrollY + 10 + 'px'
	}
	//window.resize = window.resize || window.onscroll
	window.onscroll()
  }

  var poll = function() {
    var content$ = $('#content')
    var request = {
      buffer_id: window.App.Context.buffer_id,
      timestamp: window.App.Context.timestamp
    }

    setTimeout(function() {
      $.ajax({
        type: 'POST',
        url: '/api/query',
        data: JSON.stringify(request),
        dataType: 'json',
        contentType: 'application/json; charset=utf-8'
      }).done(function(data) {
        // Status <- Online
        if (!data) {
          return
        }

        switch (data.status) {
        case 'UNCHANGED':
          break
        case 'DISCONNECTED':
          disconnected = true
          break
        case 'OK':
          var oldScrollProps = getVerticalScrollProperties()
          // Fill the filename
          document.title = data.filename + '\u2014' + data.dirname
          $('#filename').text(data.filename)
          // Replace content with latest one
          content$.empty().html(data.html_part)
          window.App.Context.timestamp = data.timestamp
          window.App.Context.revivable_key = data.revivable_key

          // dirty hack for auto scrolling if images exist
          var img$ = $('img')
          var doAutoScroll
          if (img$.length) {
            doAutoScroll = function() {
              img$.imagesLoaded()
                .always(function() {
                  autoScroll(oldScrollProps)
                })
            }
          } else {
            doAutoScroll = function() {
              autoScroll(oldScrollProps)
            }
          }

          // typeset for MathJax
          if (mathJaxEnabled) {
            MathJax.Hub.Queue(
              ['resetEquationNumbers', MathJax.InputJax.TeX], ['Typeset', MathJax.Hub, content$[0]],
              doAutoScroll)
          } else {
            doAutoScroll()
          }
          break
        }
		
        prefix_lineno()
		float_toc()
      }).fail(function() {
        // Status <- Offline
        // console.log('Offline')
      }).always(function() {
        if (!disconnected) {
          poll()
        } else {
          reviveBuffer()
        }
      })
    }, pollingInterval)
  }

  // Start polling once page started
  poll()
  
  
})
